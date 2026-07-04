import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from "@react-google-maps/api";
import { MapPin, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { parcelApi } from "../../customer/services/parcelApi";

const NEXT_STATUS = {
  ACCEPTED: { next: "RIDER_ASSIGNED", label: "Start Ride to Pickup" },
  RIDER_ASSIGNED: { next: "PICKUP_REACHED", label: "Reached Pickup" },
  PICKUP_REACHED: { next: "PICKED_UP", label: "Picked Up Parcel" },
  PICKED_UP: { next: "OUT_FOR_DELIVERY", label: "Start Delivery" },
};
const MAP_LIBRARIES = ["places"];

/** Heading to pickup only (before reaching). */
const TO_PICKUP_STATUSES = new Set(["ACCEPTED", "RIDER_ASSIGNED"]);
/** At pickup / parcel onboard — show full road path to drop (Ola-style). */
const TO_DROP_STATUSES = new Set(["PICKUP_REACHED", "PICKED_UP", "OUT_FOR_DELIVERY"]);

const ROUTE_REFRESH_MS = 20000;
const ROUTE_MOVE_THRESHOLD_M = 40;

function toLatLng(point) {
  if (!point) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const ParcelTaskPage = () => {
  const navigate = useNavigate();
  const { parcelId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [otp, setOtp] = useState("");
  const [parcel, setParcel] = useState(null);
  const [directions, setDirections] = useState(null);
  const [riderLocation, setRiderLocation] = useState(null);
  const mapRef = useRef(null);
  const assignedRequestRef = useRef({ inFlight: false, lastFetchedAt: 0 });
  const lastRouteOriginRef = useRef(null);
  const lastRouteKeyRef = useRef("");
  const lastRouteAtRef = useRef(0);

  const { isLoaded } = useJsApiLoader({
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

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords?.latitude;
        const lng = pos.coords?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        setRiderLocation({ lat, lng });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => {
      if (watchId != null && navigator.geolocation?.clearWatch) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  const statusStep = useMemo(() => NEXT_STATUS[parcel?.status], [parcel?.status]);
  const completed = parcel?.status === "DELIVERED";
  const cancelled = parcel?.status === "CANCELLED";

  const pickupPoint = useMemo(
    () => toLatLng(parcel?.pickupAddress),
    [parcel?.pickupAddress?.lat, parcel?.pickupAddress?.lng],
  );
  const dropPoint = useMemo(
    () => toLatLng(parcel?.dropAddress),
    [parcel?.dropAddress?.lat, parcel?.dropAddress?.lng],
  );

  const goingToDrop = TO_DROP_STATUSES.has(parcel?.status);
  const goingToPickup = TO_PICKUP_STATUSES.has(parcel?.status) || !goingToDrop;

  const routeEndpoints = useMemo(() => {
    if (!pickupPoint || !dropPoint) return null;

    if (goingToDrop) {
      // After pickup: full road path from rider (or pickup) → drop.
      const origin = riderLocation || pickupPoint;
      return { origin, destination: dropPoint, phase: "drop" };
    }

    // Reached / assigned: full road path from rider → pickup.
    // Fallback to full pickup→drop so map never looks empty.
    if (riderLocation) {
      return { origin: riderLocation, destination: pickupPoint, phase: "pickup" };
    }
    return { origin: pickupPoint, destination: dropPoint, phase: "full" };
  }, [pickupPoint, dropPoint, riderLocation, goingToDrop, goingToPickup]);

  const fitRouteOnMap = useCallback((result) => {
    const map = mapRef.current;
    if (!map || !result?.routes?.[0]?.bounds || !window.google) return;
    const bounds = result.routes[0].bounds;
    // Keep route above bottom sheet (Ola-style padding).
    map.fitBounds(bounds, {
      top: 96,
      right: 36,
      bottom: Math.round(window.innerHeight * 0.42),
      left: 36,
    });
  }, []);

  useEffect(() => {
    if (!isLoaded || !window.google || !routeEndpoints) return;

    const { origin, destination, phase } = routeEndpoints;
    const routeKey = `${phase}:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}>${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
    const now = Date.now();
    const movedFar =
      !lastRouteOriginRef.current ||
      distanceMeters(lastRouteOriginRef.current, origin) >= ROUTE_MOVE_THRESHOLD_M;
    const timedOut = now - lastRouteAtRef.current >= ROUTE_REFRESH_MS;
    const phaseChanged = !lastRouteKeyRef.current.startsWith(`${phase}:`);
    const hasRoute = Boolean(lastRouteKeyRef.current);

    if (
      lastRouteKeyRef.current === routeKey ||
      (!phaseChanged && !movedFar && !timedOut && hasRoute)
    ) {
      return;
    }

    const service = new window.google.maps.DirectionsService();
    service.route(
      {
        origin,
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false,
      },
      (result, status) => {
        if (status !== window.google.maps.DirectionsStatus.OK || !result) return;
        lastRouteKeyRef.current = routeKey;
        lastRouteOriginRef.current = origin;
        lastRouteAtRef.current = Date.now();
        setDirections(result);
        // Fit full path into view (like Ola).
        requestAnimationFrame(() => fitRouteOnMap(result));
      },
    );
  }, [isLoaded, routeEndpoints, fitRouteOnMap]);

  // Re-fit when map instance becomes ready after directions already loaded.
  useEffect(() => {
    if (directions) fitRouteOnMap(directions);
  }, [directions, fitRouteOnMap]);

  const mapCenter = useMemo(() => {
    if (riderLocation) return riderLocation;
    if (pickupPoint && dropPoint) {
      return {
        lat: (pickupPoint.lat + dropPoint.lat) / 2,
        lng: (pickupPoint.lng + dropPoint.lng) / 2,
      };
    }
    return { lat: 22.7196, lng: 75.8577 };
  }, [riderLocation, pickupPoint, dropPoint]);

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
    <div className="min-h-screen bg-slate-100 relative overflow-x-hidden overscroll-x-none touch-pan-y">
      <div className="absolute inset-0 z-0">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={mapCenter}
            zoom={13}
            onLoad={(map) => {
              mapRef.current = map;
              if (directions) fitRouteOnMap(directions);
            }}
            options={{
              disableDefaultUI: true,
              zoomControl: true,
              streetViewControl: false,
              mapTypeControl: false,
              gestureHandling: "greedy",
            }}
          >
            {directions && (
              <DirectionsRenderer
                directions={directions}
                options={{
                  suppressMarkers: true,
                  preserveViewport: true,
                  polylineOptions: {
                    strokeColor: "#2563eb",
                    strokeOpacity: 0.95,
                    strokeWeight: 6,
                  },
                }}
              />
            )}
            {pickupPoint && (
              <Marker
                position={pickupPoint}
                label={{ text: "P", color: "white", fontWeight: "700" }}
              />
            )}
            {dropPoint && (
              <Marker
                position={dropPoint}
                label={{ text: "D", color: "white", fontWeight: "700" }}
              />
            )}
            {riderLocation && (
              <Marker
                position={riderLocation}
                title="You"
                icon={
                  window.google
                    ? {
                        path: window.google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: "#0f172a",
                        fillOpacity: 1,
                        strokeColor: "#ffffff",
                        strokeWeight: 3,
                      }
                    : undefined
                }
              />
            )}
          </GoogleMap>
        ) : (
          <div className="h-full w-full bg-slate-100 animate-pulse" />
        )}
      </div>

      <div className="absolute top-4 left-4 right-4 z-20 rounded-2xl bg-white/90 backdrop-blur-md px-4 py-3 shadow">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Parcel Task</p>
        <div className="flex items-center justify-between gap-3 mt-1">
          <p className="text-sm font-black text-slate-900">ID: #{String(parcel._id).slice(-6)}</p>
          <div className="inline-flex px-3 py-1 rounded-full text-[10px] font-black bg-blue-100 text-blue-700">
            {parcel.status}
          </div>
        </div>
        <p className="text-[11px] font-semibold text-slate-500 mt-1">
          {goingToDrop ? "Route to drop" : "Route to pickup"}
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
              <MapPin className="h-4 w-4 mt-0.5 text-rose-500" />
              <div>
                <p className="text-[11px] font-black text-slate-700">Drop</p>
                <p className="text-xs text-slate-500">{parcel.dropAddress?.fullAddress}</p>
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
