import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GoogleMap, Marker, OverlayView, useJsApiLoader } from "@react-google-maps/api";
import { MapPin, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { parcelApi } from "../../customer/services/parcelApi";

const NEXT_STATUS = {
  ACCEPTED: { next: "RIDER_ASSIGNED", label: "Start Ride to Pickup" },
  RIDER_ASSIGNED: { next: "PICKUP_REACHED", label: "Reached Pickup" },
  PICKUP_REACHED: { next: "PICKED_UP", label: "Picked Up Parcel" },
  PICKED_UP: { next: "OUT_FOR_DELIVERY", label: "Start Delivery" },
};
const MAP_LIBRARIES = ["geometry"];

const ROUTE_REFRESH_MS = 20000;

function toLatLng(point) {
  if (!point) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

const ParcelTaskPage = () => {
  const navigate = useNavigate();
  const { parcelId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [otp, setOtp] = useState("");
  const [parcel, setParcel] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const mapRef = useRef(null);
  const routePolylineRef = useRef(null);
  const assignedRequestRef = useRef({ inFlight: false, lastFetchedAt: 0 });
  const lastRouteKeyRef = useRef("");
  const lastRouteAtRef = useRef(0);
  const routeAbortRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: MAP_LIBRARIES,
  });

  const loadAssignedParcel = useCallback(async (silent = false, options = {}) => {
    const force = options.force === true;
    if (!parcelId) return;
    const now = Date.now();
    if (!force && silent && now - assignedRequestRef.current.lastFetchedAt < 12000) return;
    if (assignedRequestRef.current.inFlight) return;
    if (!silent) setLoading(true);
    assignedRequestRef.current.inFlight = true;
    try {
      const res = await parcelApi.riderGetAssigned({ ttl: 12000 });
      if (!res.data?.success) throw new Error("Failed to load assigned parcels");
      const list = res.data.results || res.data.result || [];
      const match = list.find((p) => String(p._id) === String(parcelId));
      if (!match) {
        if (!silent) toast.error("Parcel task not found or no longer assigned.");
        navigate("/delivery/dashboard");
        return;
      }
      setParcel(match);
    } catch (error) {
      if (!silent) toast.error("Failed to load parcel task");
      navigate("/delivery/dashboard");
    } finally {
      assignedRequestRef.current.inFlight = false;
      assignedRequestRef.current.lastFetchedAt = Date.now();
      if (!silent) setLoading(false);
    }
  }, [parcelId, navigate]);

  useEffect(() => {
    loadAssignedParcel(false, { force: true });
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      loadAssignedParcel(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [loadAssignedParcel]);

  const statusStep = useMemo(() => NEXT_STATUS[parcel?.status], [parcel?.status]);
  const completed = parcel?.status === "DELIVERED";
  const cancelled = parcel?.status === "CANCELLED";

  const pickupPoint = useMemo(
    () => toLatLng(parcel?.pickupAddress),
    [parcel?.pickupAddress?.lat, parcel?.pickupAddress?.lng],
  );
  const courierAgencyPoint = useMemo(
    () => toLatLng(parcel?.dropAddress),
    [parcel?.dropAddress?.lat, parcel?.dropAddress?.lng],
  );
  const courierCompanyName =
    parcel?.courierCompany || parcel?.dropAddress?.name || "Courier Company";
  const courierCity = parcel?.destinationCity || "";

  const routeEndpoints = useMemo(() => {
    if (!pickupPoint || !courierAgencyPoint) return null;
    return { origin: pickupPoint, destination: courierAgencyPoint, phase: "agency" };
  }, [pickupPoint, courierAgencyPoint]);

  const decodedPath = useMemo(() => {
    const encoded = routeData?.polyline;
    if (!encoded || !isLoaded || !window.google?.maps?.geometry?.encoding) return null;
    try {
      return window.google.maps.geometry.encoding.decodePath(encoded);
    } catch {
      return null;
    }
  }, [routeData?.polyline, isLoaded]);

  const linePath = useMemo(() => {
    if (decodedPath?.length) return decodedPath;
    if (!routeEndpoints?.origin || !routeEndpoints?.destination) return [];
    if (!routeData?.degraded) return [];
    return [
      routeEndpoints.origin,
      routeEndpoints.destination,
    ];
  }, [decodedPath, routeData?.degraded, routeEndpoints]);

  const fitRouteOnMap = useCallback((path) => {
    const map = mapRef.current;
    if (!map || !path?.length || !window.google) return;
    const bounds = new window.google.maps.LatLngBounds();
    path.forEach((point) => bounds.extend(point));
    if (pickupPoint) bounds.extend(pickupPoint);
    if (courierAgencyPoint) bounds.extend(courierAgencyPoint);
    map.fitBounds(bounds, {
      top: 96,
      right: 36,
      bottom: Math.round(window.innerHeight * 0.42),
      left: 36,
    });
  }, [pickupPoint, courierAgencyPoint]);

  const fetchRoute = useCallback(async () => {
    if (!parcelId || !routeEndpoints) return;

    const { origin, destination, phase } = routeEndpoints;
    const routeKey = `${phase}:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}>${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
    const now = Date.now();
    const timedOut = now - lastRouteAtRef.current >= ROUTE_REFRESH_MS;

    if (
      lastRouteKeyRef.current === routeKey ||
      (!timedOut && Boolean(lastRouteKeyRef.current))
    ) {
      return;
    }

    if (routeAbortRef.current) routeAbortRef.current.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    setRouteLoading(true);

    try {
      const res = await parcelApi.getParcelRoute(
        parcelId,
        {
          phase,
          originLat: origin.lat,
          originLng: origin.lng,
          _t: now,
        },
        { signal: controller.signal },
      );
      if (res.data?.success) {
        const nextRoute = res.data.result || res.data.data || null;
        lastRouteKeyRef.current = routeKey;
        lastRouteAtRef.current = Date.now();
        setRouteData(nextRoute);
      }
    } catch (error) {
      if (error?.name !== "CanceledError" && error?.code !== "ERR_CANCELED") {
        setRouteData((prev) => prev || { degraded: true });
      }
    } finally {
      if (routeAbortRef.current === controller) routeAbortRef.current = null;
      setRouteLoading(false);
    }
  }, [parcelId, routeEndpoints]);

  useEffect(() => {
    fetchRoute();
    const timer = setInterval(fetchRoute, ROUTE_REFRESH_MS);
    return () => {
      clearInterval(timer);
      if (routeAbortRef.current) {
        routeAbortRef.current.abort();
        routeAbortRef.current = null;
      }
    };
  }, [fetchRoute]);

  useEffect(() => {
    if (!isLoaded || !mapInstance || !window.google?.maps) return undefined;

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    if (!linePath?.length) return undefined;

    const pl = new window.google.maps.Polyline({
      path: linePath,
      strokeColor: "#2563eb",
      strokeOpacity: routeData?.degraded ? 0.55 : 0.95,
      strokeWeight: 6,
      map: mapInstance,
      zIndex: 10,
    });
    routePolylineRef.current = pl;
    requestAnimationFrame(() => fitRouteOnMap(linePath));

    return () => {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
    };
  }, [isLoaded, mapInstance, linePath, routeData?.degraded, fitRouteOnMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return undefined;
    const handleResize = () => {
      window.google.maps.event.trigger(map, "resize");
      if (linePath?.length) fitRouteOnMap(linePath);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [linePath, fitRouteOnMap]);

  const mapCenter = useMemo(() => {
    if (pickupPoint && courierAgencyPoint) {
      return {
        lat: (pickupPoint.lat + courierAgencyPoint.lat) / 2,
        lng: (pickupPoint.lng + courierAgencyPoint.lng) / 2,
      };
    }
    if (pickupPoint) return pickupPoint;
    if (courierAgencyPoint) return courierAgencyPoint;
    return { lat: 22.7196, lng: 75.8577 };
  }, [pickupPoint, courierAgencyPoint]);

  const handleAdvance = async () => {
    if (!parcel || !statusStep || saving) return;
    setSaving(true);
    try {
      const res = await parcelApi.riderUpdateStatus({
        parcelId: parcel._id,
        status: statusStep.next,
      });
      if (res.data?.success) {
        setParcel(res.data.result || parcel);
        // Force route rebuild for next phase.
        lastRouteKeyRef.current = "";
        lastRouteAtRef.current = 0;
        setRouteData(null);
        toast.success("Parcel status updated");
      } else {
        toast.error(res.data?.message || "Failed to update status");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!parcel || saving) return;
    setSaving(true);
    try {
      const res = await parcelApi.riderUpdateStatus({
        parcelId: parcel._id,
        status: "CANCELLED",
      });
      if (res.data?.success) {
        toast.info("Parcel cancelled");
        navigate("/delivery/dashboard");
      } else {
        toast.error(res.data?.message || "Failed to cancel parcel");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to cancel parcel");
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!parcel || !otp.trim() || saving) return;
    setSaving(true);
    try {
      const res = await parcelApi.riderCompleteDelivery({
        parcelId: parcel._id,
        otp: otp.trim(),
      });
      if (res.data?.success) {
        toast.success("Parcel delivered successfully");
        navigate("/delivery/dashboard");
      } else {
        toast.error(res.data?.message || "Failed to complete delivery");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to complete delivery");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !parcel) {
    return <div className="p-6 text-sm font-semibold text-slate-500">Loading parcel task...</div>;
  }

  return (
    <div className="h-screen bg-slate-100 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        {loadError ? (
          <div className="h-full w-full flex items-center justify-center px-6 text-center text-sm text-rose-700 bg-rose-50">
            Map failed to load. Check your Google Maps API key.
          </div>
        ) : isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={mapCenter}
            zoom={13}
            onLoad={(map) => {
              mapRef.current = map;
              setMapInstance(map);
              if (linePath?.length) fitRouteOnMap(linePath);
            }}
            options={{
              disableDefaultUI: true,
              zoomControl: true,
              streetViewControl: false,
              mapTypeControl: false,
              gestureHandling: "greedy",
            }}
          >
            {pickupPoint && (
              <Marker
                position={pickupPoint}
                title="Pickup location"
                label={{ text: "P", color: "white", fontWeight: "700" }}
              />
            )}
            {courierAgencyPoint && (
              <>
                <Marker
                  position={courierAgencyPoint}
                  title={courierCompanyName}
                  label={{ text: "C", color: "white", fontWeight: "700" }}
                />
                <OverlayView
                  position={courierAgencyPoint}
                  mapPaneName={OverlayView.FLOAT_PANE}
                  getPixelPositionOffset={(width, height) => ({
                    x: -(width / 2),
                    y: -(height + 42),
                  })}
                >
                  <div className="rounded-lg bg-white px-2.5 py-1 shadow-md border border-slate-200 text-[10px] font-black text-slate-800 whitespace-nowrap max-w-[160px] truncate">
                    {courierCompanyName}
                  </div>
                </OverlayView>
              </>
            )}
          </GoogleMap>
        ) : (
          <div className="h-full w-full bg-slate-100 animate-pulse" />
        )}
      </div>

      {routeData?.degraded && (
        <div className="absolute top-24 left-4 right-4 z-20 rounded-xl bg-amber-50/95 border border-amber-200 px-3 py-2 text-[11px] text-amber-900 leading-snug">
          Road route unavailable. Add <span className="font-mono">GOOGLE_MAPS_API_KEY</span> to backend
          .env with Directions API enabled, then restart the server.
        </div>
      )}

      {routeLoading && !linePath?.length && (
        <div className="absolute top-24 left-4 z-20 rounded-lg bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow">
          Loading route...
        </div>
      )}

      <div className="absolute top-4 left-4 right-4 z-20 rounded-2xl bg-white/90 backdrop-blur-md px-4 py-3 shadow">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Parcel Task</p>
        <div className="flex items-center justify-between gap-3 mt-1">
          <p className="text-sm font-black text-slate-900">ID: #{String(parcel._id).slice(-6)}</p>
          <div className="inline-flex px-3 py-1 rounded-full text-[10px] font-black bg-blue-100 text-blue-700">
            {parcel.status}
          </div>
        </div>
        <p className="text-[11px] font-semibold text-slate-500 mt-1">
          Pickup → {courierCompanyName}
          {courierCity ? ` (${courierCity})` : ""}
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20">
        <div className="bg-white rounded-t-[24px] shadow-[0_-20px_50px_rgba(15,23,42,0.16)] px-5 pt-4 pb-5 max-h-[66vh] overflow-y-auto space-y-3">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" />

          <div className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2 space-y-1.5">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-brand-600" />
              <div>
                <p className="text-[11px] font-black text-slate-700">Pickup</p>
                <p className="text-xs text-slate-500">{parcel.pickupAddress?.fullAddress}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 text-primary" />
              <div>
                <p className="text-[11px] font-black text-slate-700">Courier Company</p>
                <p className="text-xs font-semibold text-slate-800">{courierCompanyName}</p>
                {courierCity ? (
                  <p className="text-[11px] text-slate-500 mt-0.5">Agency city: {courierCity}</p>
                ) : null}
              </div>
            </div>
          </div>

          {parcel.status === "OUT_FOR_DELIVERY" && !completed && !cancelled && (
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5 space-y-2">
              <p className="text-xs font-bold text-slate-700">Enter customer OTP to complete delivery</p>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                placeholder="6-digit OTP"
              />
              <button
                type="button"
                onClick={handleComplete}
                disabled={saving || otp.trim().length < 4}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-70"
              >
                <CheckCircle2 size={16} /> {saving ? "Submitting..." : "Complete Delivery"}
              </button>
            </div>
          )}

          {!completed && !cancelled && (
            <div className="grid grid-cols-2 gap-2">
              {statusStep ? (
                <button
                  type="button"
                  onClick={handleAdvance}
                  disabled={saving}
                  className="w-full py-2 rounded-xl bg-primary text-white text-[13px] font-black disabled:opacity-70"
                >
                  {saving ? "Updating..." : statusStep.label}
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="w-full py-2 rounded-xl bg-red-600 text-white text-[13px] font-black disabled:opacity-70"
              >
                Cancel
              </button>
            </div>
          )}

          {(completed || cancelled) && (
            <button
              type="button"
              onClick={() => navigate("/delivery/dashboard")}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-black"
            >
              Back to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParcelTaskPage;
