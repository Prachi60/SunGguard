import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  Truck,
  DollarSign,
  Package,
  TrendingUp,
  Settings,
  User,
  MapPin,
  ClipboardList,
  AlertCircle,
  Activity,
  CheckCircle2,
  XCircle,
  Save,
  ArrowRight,
  Building2,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { parcelApi } from "../../customer/services/parcelApi";
import MapPicker from "../../../shared/components/MapPicker";
import {
  composeCourierFullAddress,
  emptyCourierLocation,
  courierLocationFromCompany,
  buildCourierLocationPayload,
  validateCourierLocationForm,
} from "../utils/courierLocation";
import { onParcelNew, onParcelStatusUpdate, getOrderSocket } from "@/core/services/orderSocket";
import { createSocketTokenReader } from "@core/utils/authStorage";
import { STORAGE_KEYS } from "@core/utils/storage";

const updateCourierFormLocation = (formSetter, field, value) => {
  formSetter((prev) => {
    const location = { ...prev.location, [field]: value };
    location.fullAddress = composeCourierFullAddress(location);
    return { ...prev, location };
  });
};

const CourierLocationFields = ({ location, onFieldChange, onOpenMap }) => (
  <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
    <div className="flex items-center justify-between gap-2">
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">
          Office Location
        </p>
        <p className="text-[10px] text-slate-400 font-medium mt-0.5">
          Riders will drop parcels at this branch address.
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenMap}
        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-white px-3 py-2 text-[11px] font-bold text-primary hover:bg-primary/5"
      >
        <MapPin size={14} />
        {location.lat && location.lng ? "Update Map" : "Pick on Map"}
      </button>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Flat / Shop No.</label>
        <input
          type="text"
          value={location.flatNo}
          onChange={(e) => onFieldChange("flatNo", e.target.value)}
          placeholder="e.g. 12B"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary bg-white"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Contact Phone</label>
        <input
          type="tel"
          value={location.phone}
          onChange={(e) => onFieldChange("phone", e.target.value)}
          placeholder="10-digit number"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary bg-white"
        />
      </div>
    </div>

    <div className="space-y-1">
      <label className="text-xs font-bold text-slate-500 uppercase">Street / Building</label>
      <input
        type="text"
        required
        value={location.address}
        onChange={(e) => onFieldChange("address", e.target.value)}
        placeholder="Building name, street, area"
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary bg-white"
      />
    </div>

    <div className="space-y-1">
      <label className="text-xs font-bold text-slate-500 uppercase">Landmark</label>
      <input
        type="text"
        value={location.landmark}
        onChange={(e) => onFieldChange("landmark", e.target.value)}
        placeholder="Near metro, mall, etc."
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary bg-white"
      />
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">City</label>
        <input
          type="text"
          required
          value={location.city}
          onChange={(e) => onFieldChange("city", e.target.value)}
          placeholder="City"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary bg-white"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">State</label>
        <input
          type="text"
          required
          value={location.state}
          onChange={(e) => onFieldChange("state", e.target.value)}
          placeholder="State"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary bg-white"
        />
      </div>
    </div>

    <div className="space-y-1">
      <label className="text-xs font-bold text-slate-500 uppercase">Pincode</label>
      <input
        type="text"
        required
        value={location.pincode}
        onChange={(e) => onFieldChange("pincode", e.target.value)}
        placeholder="6-digit pincode"
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary bg-white"
      />
    </div>

    {location.fullAddress ? (
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Full Address</p>
        <p className="text-xs font-medium text-slate-700 mt-1">{location.fullAddress}</p>
        {location.lat && location.lng ? (
          <p className="text-[10px] text-slate-400 mt-1 font-mono">
            {Number(location.lat).toFixed(5)}, {Number(location.lng).toFixed(5)}
          </p>
        ) : (
          <p className="text-[10px] text-amber-600 mt-1 font-semibold">
            Map location not selected yet
          </p>
        )}
      </div>
    ) : null}
  </div>
);

const AdminParcelDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'active', 'pricing', 'couriers', 'reports'
  const [loading, setLoading] = useState(false);
  const [parcels, setParcels] = useState([]);
  const [riders, setRiders] = useState([]);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [couriers, setCouriers] = useState([]);
  const [addCourierForm, setAddCourierForm] = useState({
    name: "",
    platformCharge: "0",
    companyCharge: "0",
    sortOrder: "0",
    isActive: true,
    location: emptyCourierLocation(),
  });
  const [editCourierForm, setEditCourierForm] = useState({
    name: "",
    platformCharge: "0",
    companyCharge: "0",
    sortOrder: "0",
    isActive: true,
    location: emptyCourierLocation(),
  });
  const [courierMapPickerTarget, setCourierMapPickerTarget] = useState(null);
  const [courierSaving, setCourierSaving] = useState(false);
  const [courierEditModalOpen, setCourierEditModalOpen] = useState(false);
  const [editingCourierId, setEditingCourierId] = useState(null);
  const [courierToDelete, setCourierToDelete] = useState(null);
  const [courierDeleting, setCourierDeleting] = useState(false);
  const courierEditScrollRef = useRef(null);
  const courierEditModalRef = useRef(null);

  const modalOpen = Boolean(selectedParcel || courierEditModalOpen || courierToDelete);

  useEffect(() => {
    if (!modalOpen) return undefined;

    const scrollY = window.scrollY;
    const { overflow: prevBodyOverflow, position: prevBodyPosition, top: prevBodyTop, width: prevBodyWidth } =
      document.body.style;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.position = prevBodyPosition;
      document.body.style.top = prevBodyTop;
      document.body.style.width = prevBodyWidth;
      document.documentElement.style.overflow = prevHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!courierEditModalOpen) return undefined;

    const handleWheel = (event) => {
      const modalEl = courierEditModalRef.current;
      const scrollEl = courierEditScrollRef.current;
      const dialogEl = modalEl?.querySelector("[data-courier-edit-dialog]");

      if (!modalEl?.contains(event.target)) {
        event.preventDefault();
        return;
      }

      if (!dialogEl?.contains(event.target)) {
        event.preventDefault();
        return;
      }

      if (!scrollEl) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
      scrollEl.scrollTop = Math.min(
        maxScroll,
        Math.max(0, scrollEl.scrollTop + event.deltaY),
      );
    };

    document.addEventListener("wheel", handleWheel, { passive: false, capture: true });

    return () => {
      document.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, [courierEditModalOpen]);

  // Pricing Config state
  const [pricing, setPricing] = useState({
    baseFare: 0,
    perKmCharge: 0,
    weightCharge: 0,
    baseSearchRadiusKm: 5,
    radiusMultiplier: 1.6,
    riderBaseFareSharePercent: 80,
    riderDistanceFareSharePercent: 80,
    packageTypes: [
      { value: "document", label: "Document / Paper", isActive: true },
      { value: "food", label: "Food Items", isActive: true },
      { value: "clothes", label: "Clothes / Fabric", isActive: true },
      { value: "electronics", label: "Electronics", isActive: true },
      { value: "other", label: "Other Packets", isActive: true },
    ],
    maxWeightKg: 1,
    packageDescriptionPlaceholder: "E.g. keys, critical document papers...",
  });
  const [newPackageTypeLabel, setNewPackageTypeLabel] = useState("");
  const [pricingSaving, setPricingSaving] = useState(false);

  // Reports state
  const [reports, setReports] = useState({
    totalDeliveries: 0,
    completed: 0,
    cancelled: 0,
    revenue: 0,
    riderSharePercent: 80,
    riderPayout: 0,
    adminCommission: 0,
  });

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      // Fetch Parcels
      const parcelsRes = await parcelApi.adminGetParcels();
      if (parcelsRes.data && parcelsRes.data.success) {
        setParcels(parcelsRes.data.results || parcelsRes.data.result || []);
      }

      // Fetch Riders
      const ridersRes = await parcelApi.adminGetRiders();
      if (ridersRes.data && ridersRes.data.success) {
        setRiders(ridersRes.data.results || ridersRes.data.result || []);
      }

      // Fetch Courier Companies
      const couriersRes = await parcelApi.adminGetCouriers();
      if (couriersRes.data && couriersRes.data.success) {
        setCouriers(couriersRes.data.results || couriersRes.data.result || []);
      }

      // Fetch Pricing
      const pricingRes = await parcelApi.adminGetPricingConfig();
      if (pricingRes.data && pricingRes.data.success) {
        const cfg = pricingRes.data.result || {};
        setPricing({
          baseFare: cfg.baseFare || 0,
          perKmCharge: cfg.perKmCharge || 0,
          weightCharge: cfg.weightCharge || 0,
          baseSearchRadiusKm: cfg.baseSearchRadiusKm ?? 5,
          radiusMultiplier: cfg.radiusMultiplier ?? 1.6,
          riderBaseFareSharePercent:
            cfg.riderBaseFareSharePercent ?? cfg.riderSharePercent ?? 80,
          riderDistanceFareSharePercent:
            cfg.riderDistanceFareSharePercent ?? cfg.riderSharePercent ?? 80,
          packageTypes: Array.isArray(cfg.packageTypes) && cfg.packageTypes.length
            ? cfg.packageTypes
            : [
                { value: "document", label: "Document / Paper", isActive: true },
                { value: "food", label: "Food Items", isActive: true },
                { value: "clothes", label: "Clothes / Fabric", isActive: true },
                { value: "electronics", label: "Electronics", isActive: true },
                { value: "other", label: "Other Packets", isActive: true },
              ],
          maxWeightKg: cfg.maxWeightKg ?? 1,
          packageDescriptionPlaceholder:
            cfg.packageDescriptionPlaceholder ||
            "E.g. keys, critical document papers...",
        });
      }

      // Fetch Reports
      const reportsRes = await parcelApi.adminGetReports();
      if (reportsRes.data && reportsRes.data.success) {
        setReports({
          totalDeliveries: 0,
          completed: 0,
          cancelled: 0,
          revenue: 0,
          riderSharePercent: 80,
          riderPayout: 0,
          adminCommission: 0,
          ...(reportsRes.data.result || {}),
        });
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      if (!isSilent) toast.error("Failed to load dashboard data");
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);

    // 15-second background polling to ensure dashboard data remains consistent
    const pollInterval = setInterval(() => {
      fetchData(true);
    }, 15000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [fetchData]);

  // Listen to real-time parcel bookings via socket
  useEffect(() => {
    const getToken = createSocketTokenReader(STORAGE_KEYS.AUTH_ADMIN);
    const unsubscribe = onParcelNew(getToken, (newParcel) => {
      console.log("[AdminParcelDashboard] Real-time new parcel:", newParcel);
      
      // Update parcels state: prepend newParcel if not already present
      setParcels((prev) => {
        if (prev.some((p) => p._id === newParcel._id)) return prev;
        return [newParcel, ...prev];
      });

      // Update reports count
      setReports((prev) => ({
        ...prev,
        totalDeliveries: (prev.totalDeliveries || 0) + 1,
      }));

      toast.info(`New parcel request #${String(newParcel._id).slice(-6)}`);
      setSelectedParcel(newParcel);

      // Immediately fetch fully populated data in background
      fetchData(true);
    });

    return () => {
      unsubscribe();
    };
  }, [fetchData]);

  // Open parcel details when navigated from notification / alert (`?parcelId=`)
  useEffect(() => {
    const parcelId = searchParams.get("parcelId");
    if (!parcelId || !parcels.length) return;
    const match = parcels.find((p) => String(p._id) === String(parcelId));
    if (!match) return;
    setSelectedParcel(match);
    setActiveTab("all");
    const next = new URLSearchParams(searchParams);
    next.delete("parcelId");
    setSearchParams(next, { replace: true });
  }, [parcels, searchParams, setSearchParams]);

  // Live status updates (assigned rider / progress / delivered)
  useEffect(() => {
    const getToken = createSocketTokenReader(STORAGE_KEYS.AUTH_ADMIN);
    getOrderSocket(getToken);
    return onParcelStatusUpdate(getToken, (payload) => {
      const updated = payload?.parcel || payload;
      const id = updated?._id || payload?.parcelId;
      if (!id) return;

      setParcels((prev) => {
        const exists = prev.some((p) => String(p._id) === String(id));
        if (!exists) return prev;
        return prev.map((p) => (String(p._id) === String(id) ? { ...p, ...updated } : p));
      });

      // keep summary reasonably fresh
      fetchData(true);
    });
  }, [fetchData]);

  // Handle pricing update
  const handleUpdatePricing = async (e) => {
    e.preventDefault();
    setPricingSaving(true);
    try {
      const payload = {
        baseFare: Number(pricing.baseFare),
        perKmCharge: Number(pricing.perKmCharge),
        weightCharge: Number(pricing.weightCharge),
        baseSearchRadiusKm: Number(pricing.baseSearchRadiusKm),
        radiusMultiplier: Number(pricing.radiusMultiplier),
        riderBaseFareSharePercent: Number(pricing.riderBaseFareSharePercent),
        riderDistanceFareSharePercent: Number(pricing.riderDistanceFareSharePercent),
        packageTypes: pricing.packageTypes,
        maxWeightKg: Number(pricing.maxWeightKg),
        packageDescriptionPlaceholder: pricing.packageDescriptionPlaceholder,
      };
      const res = await parcelApi.adminUpdatePricingConfig(payload);
      if (res.data && res.data.success) {
        toast.success("Parcel settings updated successfully!");
        fetchData();
      } else {
        toast.error(res.data.message || "Failed to update settings");
      }
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setPricingSaving(false);
    }
  };

  const emptyCourierForm = {
    name: "",
    platformCharge: "0",
    companyCharge: "0",
    sortOrder: "0",
    isActive: true,
    location: emptyCourierLocation(),
  };

  const handleCourierMapConfirm = (mapLocation) => {
    const applyMapLocation = (prev) => {
      const location = {
        ...prev.location,
        address: prev.location.address || mapLocation.locality || mapLocation.address || "",
        city: mapLocation.city || prev.location.city || "",
        state: mapLocation.state || prev.location.state || "",
        pincode: mapLocation.pincode || prev.location.pincode || "",
        lat: mapLocation.lat,
        lng: mapLocation.lng,
      };
      location.fullAddress = composeCourierFullAddress(location);
      return { ...prev, location };
    };

    if (courierMapPickerTarget === "add") {
      setAddCourierForm(applyMapLocation);
    } else if (courierMapPickerTarget === "edit") {
      setEditCourierForm(applyMapLocation);
    }
    setCourierMapPickerTarget(null);
    toast.success("Courier office location updated");
  };

  const activeCourierMapLocation =
    courierMapPickerTarget === "edit"
      ? editCourierForm.location
      : courierMapPickerTarget === "add"
        ? addCourierForm.location
        : null;

  const closeCourierEditModal = () => {
    setCourierEditModalOpen(false);
    setEditingCourierId(null);
    setEditCourierForm(emptyCourierForm);
  };

  const startEditCourier = (company) => {
    setEditingCourierId(company._id);
    setEditCourierForm({
      name: company.name || "",
      platformCharge: String(company.platformCharge ?? 0),
      companyCharge: String(company.companyCharge ?? 0),
      sortOrder: String(company.sortOrder ?? 0),
      isActive: company.isActive !== false,
      location: courierLocationFromCompany(company),
    });
    setCourierEditModalOpen(true);
  };

  const buildCourierApiPayload = (form) => ({
    name: String(form.name || "").trim(),
    platformCharge: Number(form.platformCharge) || 0,
    companyCharge: Number(form.companyCharge) || 0,
    sortOrder: Number(form.sortOrder) || 0,
    isActive: form.isActive !== false,
    ...buildCourierLocationPayload(form.location),
  });

  const handleAddCourier = async (e) => {
    e.preventDefault();
    const name = String(addCourierForm.name || "").trim();
    if (!name) {
      return toast.error("Courier company name is required");
    }
    const locationError = validateCourierLocationForm(addCourierForm.location);
    if (locationError) {
      return toast.error(locationError);
    }

    setCourierSaving(true);
    try {
      const payload = buildCourierApiPayload(addCourierForm);
      const res = await parcelApi.adminCreateCourier(payload);
      if (res.data?.success) {
        toast.success("Courier company added");
        setAddCourierForm(emptyCourierForm);
        fetchData(true);
      } else {
        toast.error(res.data?.message || "Failed to save courier company");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save courier company");
    } finally {
      setCourierSaving(false);
    }
  };

  const handleUpdateCourier = async (e) => {
    e.preventDefault();
    const name = String(editCourierForm.name || "").trim();
    if (!name) {
      return toast.error("Courier company name is required");
    }
    if (!editingCourierId) return;
    const locationError = validateCourierLocationForm(editCourierForm.location);
    if (locationError) {
      return toast.error(locationError);
    }

    setCourierSaving(true);
    try {
      const payload = buildCourierApiPayload(editCourierForm);
      const res = await parcelApi.adminUpdateCourier(editingCourierId, payload);
      if (res.data?.success) {
        toast.success("Courier company updated");
        closeCourierEditModal();
        fetchData(true);
      } else {
        toast.error(res.data?.message || "Failed to update courier company");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update courier company");
    } finally {
      setCourierSaving(false);
    }
  };

  const confirmDeleteCourier = async () => {
    const courierId = String(courierToDelete?._id || courierToDelete?.id || "").trim();
    if (!courierId) {
      toast.error("Could not delete: courier id missing");
      return;
    }

    setCourierDeleting(true);
    try {
      const res = await parcelApi.adminDeleteCourier(courierId);
      if (res.data?.success) {
        toast.success("Courier company deleted");
        setCouriers((prev) =>
          prev.filter((c) => String(c._id || c.id) !== courierId),
        );
        if (String(editingCourierId) === courierId) closeCourierEditModal();
        setCourierToDelete(null);
        fetchData(true);
      } else {
        toast.error(res.data?.message || "Failed to delete");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete courier company");
    } finally {
      setCourierDeleting(false);
    }
  };

  const handleToggleCourierActive = async (company) => {
    try {
      const res = await parcelApi.adminUpdateCourier(company._id, {
        isActive: !company.isActive,
      });
      if (res.data?.success) {
        toast.success(company.isActive ? "Courier deactivated" : "Courier activated");
        fetchData(true);
      } else {
        toast.error(res.data?.message || "Failed to update status");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update status");
    }
  };

  const getActiveParcels = () => {
    const activeStatuses = ["SEARCHING", "REQUESTED", "ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED", "PICKED_UP", "OUT_FOR_DELIVERY"];
    return parcels.filter(p => activeStatuses.includes(p.status));
  };

  const getSearchingParcels = () =>
    parcels.filter((p) => p.status === "SEARCHING" && !p.deliveryPartnerId);

  const formatParcelStatus = (status) => {
    if (status === "SEARCHING") return "Searching for rider";
    return status;
  };

  return (
    <div className="p-6 font-outfit max-w-6xl mx-auto space-y-6">
      {/* Page Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Truck className="text-primary" size={28} /> Parcel Delivery Panel
          </h1>
          <p className="text-sm text-slate-400 font-medium mt-1">
            Manage parcel delivery bookings, configure global rates, assign riders, and monitor operations.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl gap-0.5">
          {[
            { id: "all", label: "All Bookings", icon: ClipboardList },
            { id: "active", label: "Active Deliveries", icon: Activity },
            { id: "pricing", label: "Parcel Settings", icon: Settings },
            { id: "couriers", label: "Couriers", icon: Building2 },
            { id: "reports", label: "Revenue Reports", icon: TrendingUp },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-xs transition-all ${
                activeTab === tab.id
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <span className="text-slate-400 animate-pulse font-medium">Loading panel data...</span>
        </div>
      ) : (
        <>
          {/* TAB 1: ALL BOOKINGS */}
          {activeTab === "all" && (
            <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-base font-black text-slate-800">All Requests History</h2>
                <span className="text-xs bg-slate-100 px-3 py-1 rounded-full font-bold text-slate-600">
                  {parcels.length} total requests
                </span>
              </div>

              {parcels.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  No parcel bookings registered in the system yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-bold text-xs uppercase tracking-wider border-b border-slate-100">
                        <th className="p-4">ID / Date</th>
                        <th className="p-4">Customer Details</th>
                        <th className="p-4">Pickup Address</th>
                        <th className="p-4">Dropoff Address</th>
                        <th className="p-4">Fare & Weight</th>
                        <th className="p-4">Status / Rider</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parcels.map((parcel) => (
                        <tr
                          key={parcel._id}
                          className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                          onClick={() => setSelectedParcel(parcel)}
                        >
                          <td className="p-4 align-top">
                            <span className="font-bold text-slate-800">#{parcel._id.slice(-6)}</span>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {new Date(parcel.createdAt).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <span className="font-bold text-slate-800 block">
                              {parcel.customerId?.name || "Customer"}
                            </span>
                            <span className="text-xs text-slate-400">
                              {parcel.customerId?.phone || "N/A"}
                            </span>
                          </td>
                          <td className="p-4 align-top max-w-[200px]">
                            <span className="font-bold text-slate-700 block">
                              {parcel.pickupAddress?.name} ({parcel.pickupAddress?.phone})
                            </span>
                            <span className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                              {parcel.pickupAddress?.fullAddress}
                            </span>
                          </td>
                          <td className="p-4 align-top max-w-[200px]">
                            <span className="font-bold text-slate-700 block">
                              {parcel.dropAddress?.name} ({parcel.dropAddress?.phone})
                            </span>
                            <span className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                              {parcel.dropAddress?.fullAddress}
                            </span>
                          </td>
                          <td className="p-4 align-top">
                            <span className="font-black text-slate-900 block">₹{parcel.fare}</span>
                            <span className="text-xs text-slate-400">{parcel.weight} KG</span>
                          </td>
                          <td className="p-4 align-top">
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase block w-fit ${
                              parcel.status === "DELIVERED" ? "bg-green-100 text-green-700" :
                              parcel.status === "CANCELLED" ? "bg-red-100 text-red-600" :
                              parcel.status === "SEARCHING" ? "bg-amber-100 text-amber-700 animate-pulse" :
                              "bg-blue-100 text-blue-700 animate-pulse"
                            }`}>
                              {formatParcelStatus(parcel.status)}
                            </span>

                            {parcel.deliveryPartnerId ? (
                              <div className="text-xs text-slate-500 font-medium mt-1">
                                Rider: {parcel.deliveryPartnerId.name}
                              </div>
                            ) : (
                              parcel.status !== "CANCELLED" && parcel.status !== "DELIVERED" && (
                                <div className="text-[11px] text-amber-700 font-bold mt-1">
                                  Auto broadcasting to nearby parcel riders
                                </div>
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACTIVE DELIVERIES */}
          {activeTab === "active" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Active list */}
              <div className="md:col-span-2 bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="text-base font-black text-slate-800">In-Progress Deliveries</h2>
                  <div className="flex items-center gap-2">
                    {getSearchingParcels().length > 0 && (
                      <span className="text-xs bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-bold">
                        {getSearchingParcels().length} searching
                      </span>
                    )}
                    <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-bold">
                      {getActiveParcels().length} active
                    </span>
                  </div>
                </div>

                {getActiveParcels().length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    No active parcel deliveries currently.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {getActiveParcels().map((parcel) => (
                      <div
                        key={parcel._id}
                        className="p-5 hover:bg-slate-50/50 flex flex-col md:flex-row justify-between gap-4 cursor-pointer transition-colors"
                        onClick={() => setSelectedParcel(parcel)}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">#{parcel._id.slice(-6)}</span>
                            <span className="text-xs text-slate-400">
                              {new Date(parcel.createdAt).toLocaleTimeString()}
                            </span>
                            <span className="text-[10px] font-extrabold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase">
                              {formatParcelStatus(parcel.status)}
                            </span>
                          </div>

                          <div className="text-xs text-slate-500 font-medium space-y-1">
                            <div>
                              <strong className="text-slate-700">From:</strong> {parcel.pickupAddress.fullAddress}
                            </div>
                            <div>
                              <strong className="text-slate-700">To:</strong> {parcel.dropAddress.fullAddress}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col justify-between items-end shrink-0">
                          <span className="font-black text-slate-900">₹{parcel.fare}</span>
                          {parcel.deliveryPartnerId ? (
                            <div className="text-xs bg-slate-50 px-3 py-1 rounded-lg border border-slate-200 mt-2">
                              Rider: <strong className="text-slate-700">{parcel.deliveryPartnerId.name}</strong>
                            </div>
                          ) : (
                            <div className="text-[11px] text-amber-700 font-bold mt-2">
                              Request is auto-broadcasting
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Verified riders info sidebar */}
              <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <User className="text-primary" size={18} /> Verified Riders list
                </h2>
                <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto pr-1">
                  {riders.map((rider) => {
                    const statusConfig = !rider.isParcelService
                      ? { text: "No Parcel Service", style: "bg-red-50 text-red-700" }
                      : !rider.isOnline
                      ? { text: "Offline", style: "bg-slate-100 text-slate-500" }
                      : rider.isBusy
                      ? { text: "Busy", style: "bg-amber-50 text-amber-700" }
                      : { text: "Available", style: "bg-green-50 text-green-700" };

                    return (
                      <div key={rider._id} className="py-3 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-slate-800 block">{rider.name}</span>
                          <span className="text-slate-400">{rider.phone}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${statusConfig.style}`}>
                          {statusConfig.text}
                        </span>
                      </div>
                    );
                  })}
                  {riders.length === 0 && (
                    <p className="text-slate-400 text-xs py-4 text-center">No verified delivery partners.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PARCEL SETTINGS */}
          {activeTab === "pricing" && (
            <div className="max-w-2xl mx-auto space-y-5">
              <form onSubmit={handleUpdatePricing} className="space-y-5">
                <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <DollarSign className="text-primary" size={18} /> Customer Pricing
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Fare charged to customers for parcel bookings (up to {pricing.maxWeightKg || 1} KG).
                    </p>
                  </div>

                  <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Base Fare (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={pricing.baseFare}
                        onChange={(e) => setPricing((p) => ({ ...p, baseFare: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                      />
                      <p className="text-[10px] text-slate-400 font-medium">Flat fee for every booking.</p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Per KM Charge (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={pricing.perKmCharge}
                        onChange={(e) => setPricing((p) => ({ ...p, perKmCharge: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                      />
                      <p className="text-[10px] text-slate-400 font-medium">Added per kilometer.</p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Weight / KG (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={pricing.weightCharge}
                        onChange={(e) => setPricing((p) => ({ ...p, weightCharge: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                      />
                      <p className="text-[10px] text-slate-400 font-medium">Multiplied by package weight.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <MapPin className="text-primary" size={18} /> Delivery Partner Search Radius
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Decide how far nearby parcel riders are notified when a booking starts.
                    </p>
                  </div>

                  <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Base Radius (KM)</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="0.5"
                        required
                        value={pricing.baseSearchRadiusKm}
                        onChange={(e) => setPricing((p) => ({ ...p, baseSearchRadiusKm: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                      />
                      <p className="text-[10px] text-slate-400 font-medium">
                        First broadcast radius from pickup location.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Radius Expand Multiplier</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        step="0.1"
                        required
                        value={pricing.radiusMultiplier}
                        onChange={(e) => setPricing((p) => ({ ...p, radiusMultiplier: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                      />
                      <p className="text-[10px] text-slate-400 font-medium">
                        If no rider accepts, radius grows by this factor (e.g. 5km × 1.6 = 8km).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <Package className="text-primary" size={18} /> Package Details Options
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Configure package types, max weight, and description placeholder shown to customers.
                    </p>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Max Weight (KG)</label>
                        <input
                          type="number"
                          min="0.1"
                          max="50"
                          step="0.1"
                          required
                          value={pricing.maxWeightKg}
                          onChange={(e) =>
                            setPricing((p) => ({ ...p, maxWeightKg: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">
                          Description Placeholder
                        </label>
                        <input
                          type="text"
                          value={pricing.packageDescriptionPlaceholder}
                          onChange={(e) =>
                            setPricing((p) => ({
                              ...p,
                              packageDescriptionPlaceholder: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Package Types</label>
                      <div className="space-y-2">
                        {(pricing.packageTypes || []).map((type, idx) => (
                          <div
                            key={`${type.value}-${idx}`}
                            className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center"
                          >
                            <input
                              type="text"
                              value={type.label}
                              onChange={(e) => {
                                const label = e.target.value;
                                setPricing((p) => {
                                  const next = [...(p.packageTypes || [])];
                                  next[idx] = {
                                    ...next[idx],
                                    label,
                                    value:
                                      next[idx].value ||
                                      label
                                        .toLowerCase()
                                        .replace(/[^a-z0-9]+/g, "_")
                                        .replace(/^_+|_+$/g, ""),
                                  };
                                  return { ...p, packageTypes: next };
                                });
                              }}
                              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary"
                              placeholder="Label (e.g. Document / Paper)"
                            />
                            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 px-2">
                              <input
                                type="checkbox"
                                checked={type.isActive !== false}
                                onChange={(e) => {
                                  setPricing((p) => {
                                    const next = [...(p.packageTypes || [])];
                                    next[idx] = { ...next[idx], isActive: e.target.checked };
                                    return { ...p, packageTypes: next };
                                  });
                                }}
                              />
                              Active
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setPricing((p) => ({
                                  ...p,
                                  packageTypes: (p.packageTypes || []).filter((_, i) => i !== idx),
                                }))
                              }
                              className="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={newPackageTypeLabel}
                          onChange={(e) => setNewPackageTypeLabel(e.target.value)}
                          placeholder="Add package type label"
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const label = newPackageTypeLabel.trim();
                            if (!label) return;
                            const value = label
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "_")
                              .replace(/^_+|_+$/g, "");
                            setPricing((p) => ({
                              ...p,
                              packageTypes: [
                                ...(p.packageTypes || []),
                                { value, label, isActive: true },
                              ],
                            }));
                            setNewPackageTypeLabel("");
                          }}
                          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
                        >
                          Add type
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <Truck className="text-primary" size={18} /> Delivery Partner Payout
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Rider earns admin-set % of base fare and distance fare only. Weight charge stays with platform.
                    </p>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">
                          Base Fare Share (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          required
                          value={pricing.riderBaseFareSharePercent}
                          onChange={(e) =>
                            setPricing((p) => ({ ...p, riderBaseFareSharePercent: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                        />
                        <p className="text-[10px] text-slate-400 font-medium">
                          % of base fare paid to rider.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">
                          Distance Fare Share (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          required
                          value={pricing.riderDistanceFareSharePercent}
                          onChange={(e) =>
                            setPricing((p) => ({ ...p, riderDistanceFareSharePercent: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                        />
                        <p className="text-[10px] text-slate-400 font-medium">
                          % of distance fare paid to rider.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-xs text-slate-600 font-medium space-y-1">
                      <p className="font-bold text-slate-800">Example payout</p>
                      <p>
                        Base ₹{Number(pricing.baseFare) || 0} × {Number(pricing.riderBaseFareSharePercent) || 0}%
                        {" = "}
                        ₹{(
                          ((Number(pricing.baseFare) || 0) *
                            (Number(pricing.riderBaseFareSharePercent) || 0)) /
                          100
                        ).toFixed(2)}
                      </p>
                      <p>
                        Distance (e.g. ₹100) × {Number(pricing.riderDistanceFareSharePercent) || 0}%
                        {" = "}
                        ₹{(
                          (100 * (Number(pricing.riderDistanceFareSharePercent) || 0)) /
                          100
                        ).toFixed(2)}
                      </p>
                      <p className="text-slate-400">Weight charge is not shared with the rider.</p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={pricingSaving}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                  <Save size={16} />
                  {pricingSaving ? "Saving..." : "Save parcel settings"}
                </button>
              </form>
            </div>
          )}

          {/* TAB: COURIER COMPANIES CRUD */}
          {activeTab === "couriers" && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2">
                <form
                  onSubmit={handleAddCourier}
                  className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden"
                >
                  <div className="p-5 border-b border-slate-100">
                    <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <Plus className="text-primary" size={18} />
                      Add Courier Company
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Set platform charge customers pay when they choose this courier.
                    </p>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Company Name</label>
                      <input
                        type="text"
                        required
                        value={addCourierForm.name}
                        onChange={(e) => setAddCourierForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Blue Dart"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </div>

                    <CourierLocationFields
                      location={addCourierForm.location}
                      onFieldChange={(field, value) =>
                        updateCourierFormLocation(setAddCourierForm, field, value)
                      }
                      onOpenMap={() => setCourierMapPickerTarget("add")}
                    />

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">
                        Platform Charge (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={addCourierForm.platformCharge}
                        onChange={(e) =>
                          setAddCourierForm((f) => ({ ...f, platformCharge: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                      />
                      <p className="text-[10px] text-slate-400 font-medium">
                        Extra platform fee added to customer fare when this courier is selected.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">
                        Courier Company Charge (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={addCourierForm.companyCharge}
                        onChange={(e) =>
                          setAddCourierForm((f) => ({ ...f, companyCharge: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                      />
                      <p className="text-[10px] text-slate-400 font-medium">
                        How much this courier company itself charges.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Sort Order</label>
                      <input
                        type="number"
                        step="1"
                        value={addCourierForm.sortOrder}
                        onChange={(e) => setAddCourierForm((f) => ({ ...f, sortOrder: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addCourierForm.isActive}
                        onChange={(e) =>
                          setAddCourierForm((f) => ({ ...f, isActive: e.target.checked }))
                        }
                        className="accent-primary h-4 w-4"
                      />
                      Active (shown on customer booking form)
                    </label>

                    <button
                      type="submit"
                      disabled={courierSaving}
                      className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
                    >
                      <Save size={16} />
                      {courierSaving ? "Saving..." : "Add Courier"}
                    </button>
                  </div>
                </form>
              </div>

              <div className="lg:col-span-3 bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                      <Building2 className="text-primary" size={18} /> Courier Companies
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      {couriers.length} companies · edit & delete open in modal
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {couriers.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10 font-medium">
                      No courier companies yet. Add one on the left.
                    </p>
                  ) : (
                    couriers.map((company) => (
                      <div
                        key={company._id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-slate-800">{company.name}</span>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                company.isActive
                                  ? "bg-green-50 text-green-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {company.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium mt-1">
                            Platform:{" "}
                            <span className="font-black text-slate-800">
                              ₹{Number(company.platformCharge || 0).toFixed(2)}
                            </span>
                            {" · "}Courier fee:{" "}
                            <span className="font-black text-slate-800">
                              ₹{Number(company.companyCharge || 0).toFixed(2)}
                            </span>
                            {" · "}Sort: {company.sortOrder ?? 0}
                          </p>
                          {company.location?.fullAddress ? (
                            <p className="text-[11px] text-slate-500 mt-1 flex items-start gap-1">
                              <MapPin size={12} className="shrink-0 mt-0.5 text-primary" />
                              <span className="line-clamp-2">{company.location.fullAddress}</span>
                            </p>
                          ) : (
                            <p className="text-[11px] text-amber-600 font-semibold mt-1">
                              Office location not set — edit to add address
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleCourierActive(company)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-600 hover:bg-white"
                          >
                            {company.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditCourier(company)}
                            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-primary hover:border-primary/30"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCourierToDelete(company)}
                            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REVENUE REPORTS */}
          {activeTab === "reports" && (
            <div className="space-y-6">
              {/* Stat grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
                    <ClipboardList size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Bookings</span>
                    <span className="text-2xl font-black text-slate-800 mt-1 block">
                      {reports.totalDeliveries}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 shrink-0">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Completed</span>
                    <span className="text-2xl font-black text-slate-800 mt-1 block">
                      {reports.completed}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 shrink-0">
                    <XCircle size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cancelled</span>
                    <span className="text-2xl font-black text-slate-800 mt-1 block">
                      {reports.cancelled}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm flex items-center gap-4">
                  <div className="h-12 w-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                    <DollarSign size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Revenue</span>
                    <span className="text-2xl font-black text-slate-800 mt-1 block">
                      ₹{reports.revenue}
                    </span>
                  </div>
                </div>
              </div>

              {/* Extra details card */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm max-w-2xl mx-auto space-y-4">
                <h3 className="text-base font-black text-slate-800">Financial Insights</h3>
                <p className="text-xs text-slate-400 font-medium">
                  Summary calculations based on all completed parcel deliveries.
                </p>
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100 text-xs">
                  <div className="bg-slate-50 p-4 rounded-2xl">
                    <span className="text-slate-400 font-bold block uppercase">
                      Admin Commission
                    </span>
                    <span className="text-lg font-black text-slate-800 mt-1 block">
                      ₹{Number(reports.adminCommission || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl">
                    <span className="text-slate-400 font-bold block uppercase">
                      Riders Payout (base {reports.riderBaseFareSharePercent ?? pricing.riderBaseFareSharePercent}% + distance {reports.riderDistanceFareSharePercent ?? pricing.riderDistanceFareSharePercent}%)
                    </span>
                    <span className="text-lg font-black text-slate-800 mt-1 block">
                      ₹{Number(reports.riderPayout || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Selected Parcel Details Modal */}
      {selectedParcel && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden overscroll-none">
          <style>{`
            .modal-scroll-pad::-webkit-scrollbar {
              width: 10px;
              height: 10px;
            }
            .modal-scroll-pad::-webkit-scrollbar-track {
              background: #f1f5f9 !important;
              border-radius: 8px;
            }
            .modal-scroll-pad::-webkit-scrollbar-thumb {
              background: #cbd5e1 !important;
              border-radius: 8px;
              border: 2px solid #f1f5f9;
            }
            .modal-scroll-pad::-webkit-scrollbar-thumb:hover {
              background: #94a3b8 !important;
            }
          `}</style>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col relative overflow-hidden">
            {/* Header - Fixed */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Package className="text-primary" size={20} />
                  Parcel Request Details
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Full logs, addresses, OTP validation, and uploaded proofs for booking ID: #{selectedParcel._id.slice(-6)}
                </p>
              </div>
              <button
                onClick={() => setSelectedParcel(null)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle size={22} />
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="p-6 overflow-y-auto overscroll-contain space-y-6 flex-1 modal-scroll-pad">
              {/* Grid details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</span>
                  <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase block w-fit mt-1.5 ${
                    selectedParcel.status === "DELIVERED" ? "bg-green-100 text-green-700" :
                    selectedParcel.status === "CANCELLED" ? "bg-red-100 text-red-600" :
                    "bg-blue-100 text-blue-700"
                  }`}>
                    {selectedParcel.status}
                  </span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Fare & Weight</span>
                  <span className="text-sm font-black text-slate-800 mt-1 block">₹{selectedParcel.fare} ({selectedParcel.weight} KG)</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Verification OTP</span>
                  <span className="text-sm font-black text-slate-800 mt-1 block tracking-wider">{selectedParcel.otp || "N/A"}</span>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Payment Details</span>
                  <span className="text-xs font-bold text-slate-800 mt-1.5 block">
                    {selectedParcel.paymentMethod?.toUpperCase() || "N/A"} — 
                    <span className={`ml-1 font-extrabold ${selectedParcel.paymentStatus === 'PAID' ? 'text-green-600' : 'text-amber-600'}`}>
                      {selectedParcel.paymentStatus || "PENDING"}
                    </span>
                  </span>
                </div>
              </div>

              {/* Address Details */}
              <div className="space-y-4 text-xs">
                <div className="border-t border-slate-100 pt-4">
                  <strong className="text-slate-800 block text-xs mb-1 uppercase tracking-wider">Pickup Address</strong>
                  <p className="font-bold text-slate-700">{selectedParcel.pickupAddress?.name} ({selectedParcel.pickupAddress?.phone})</p>
                  <p className="text-slate-500 mt-0.5 leading-relaxed">{selectedParcel.pickupAddress?.fullAddress}</p>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <strong className="text-slate-800 block text-xs mb-1 uppercase tracking-wider">Dropoff Address</strong>
                  <p className="font-bold text-slate-700">{selectedParcel.dropAddress?.name} ({selectedParcel.dropAddress?.phone})</p>
                  <p className="text-slate-500 mt-0.5 leading-relaxed">{selectedParcel.dropAddress?.fullAddress}</p>
                </div>

                {selectedParcel.deliveryPartnerId && (
                  <div className="border-t border-slate-100 pt-4">
                    <strong className="text-slate-800 block text-xs mb-1 uppercase tracking-wider">Assigned Rider</strong>
                    <p className="font-bold text-slate-700">{selectedParcel.deliveryPartnerId.name} ({selectedParcel.deliveryPartnerId.phone})</p>
                  </div>
                )}
              </div>

              {/* Proof Photos Section */}
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Delivery Evidence Photos</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pickup Proof</span>
                    {selectedParcel.pickupProofImage ? (
                      <div className="h-40 w-full rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
                        <img
                          src={selectedParcel.pickupProofImage}
                          alt="Pickup Proof"
                          className="h-full w-full object-cover cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => window.open(selectedParcel.pickupProofImage, "_blank")}
                        />
                      </div>
                    ) : (
                      <div className="h-40 w-full rounded-2xl border border-dashed border-slate-200 flex items-center justify-center text-center p-3 text-[10px] text-slate-400 bg-slate-50/50">
                        No pickup proof uploaded
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Delivery Proof</span>
                    {selectedParcel.deliveryProofImage ? (
                      <div className="h-40 w-full rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
                        <img
                          src={selectedParcel.deliveryProofImage}
                          alt="Delivery Proof"
                          className="h-full w-full object-cover cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => window.open(selectedParcel.deliveryProofImage, "_blank")}
                        />
                      </div>
                    ) : (
                      <div className="h-40 w-full rounded-2xl border border-dashed border-slate-200 flex items-center justify-center text-center p-3 text-[10px] text-slate-400 bg-slate-50/50">
                        No delivery proof uploaded
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer - Fixed */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedParcel(null)}
                className="w-full py-2.5 bg-white border border-slate-200 hover:bg-slate-50 font-bold text-xs text-slate-700 rounded-xl transition-all uppercase tracking-wider"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Courier Modal */}
      {courierEditModalOpen &&
        createPortal(
          <div
            ref={courierEditModalRef}
            className="fixed inset-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden overscroll-none touch-none"
          >
            <style>{`
              .modal-scroll-pad::-webkit-scrollbar {
                width: 10px;
                height: 10px;
              }
              .modal-scroll-pad::-webkit-scrollbar-track {
                background: #f1f5f9 !important;
                border-radius: 8px;
              }
              .modal-scroll-pad::-webkit-scrollbar-thumb {
                background: #cbd5e1 !important;
                border-radius: 8px;
                border: 2px solid #f1f5f9;
              }
              .modal-scroll-pad::-webkit-scrollbar-thumb:hover {
                background: #94a3b8 !important;
              }
            `}</style>
            <div
              className="absolute inset-0 z-0"
              onClick={closeCourierEditModal}
              aria-hidden="true"
            />
            <div
              data-courier-edit-dialog
              className="relative z-10 bg-white rounded-3xl border border-slate-100 shadow-xl max-w-lg w-full overflow-hidden flex flex-col touch-auto"
              style={{ height: "min(90vh, calc(100dvh - 2rem))" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-slate-100 flex justify-between items-start shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <Pencil className="text-primary" size={18} />
                    Edit Courier Company
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Update name, charges, office address, and visibility.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCourierEditModal}
                  className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <XCircle size={22} />
                </button>
              </div>

              <form onSubmit={handleUpdateCourier} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div
                  ref={courierEditScrollRef}
                  className="p-5 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0 modal-scroll-pad"
                  style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
                >
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Company Name</label>
                  <input
                    type="text"
                    required
                    value={editCourierForm.name}
                    onChange={(e) => setEditCourierForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Blue Dart"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>

                <CourierLocationFields
                  location={editCourierForm.location}
                  onFieldChange={(field, value) =>
                    updateCourierFormLocation(setEditCourierForm, field, value)
                  }
                  onOpenMap={() => setCourierMapPickerTarget("edit")}
                />

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Platform Charge (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={editCourierForm.platformCharge}
                    onChange={(e) =>
                      setEditCourierForm((f) => ({ ...f, platformCharge: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-slate-400 font-medium">
                    Extra platform fee added to customer fare when this courier is selected.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Courier Company Charge (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={editCourierForm.companyCharge}
                    onChange={(e) =>
                      setEditCourierForm((f) => ({ ...f, companyCharge: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-slate-400 font-medium">
                    How much this courier company itself charges.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Sort Order</label>
                  <input
                    type="number"
                    step="1"
                    value={editCourierForm.sortOrder}
                    onChange={(e) =>
                      setEditCourierForm((f) => ({ ...f, sortOrder: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editCourierForm.isActive}
                    onChange={(e) =>
                      setEditCourierForm((f) => ({ ...f, isActive: e.target.checked }))
                    }
                    className="accent-primary h-4 w-4"
                  />
                  Active (shown on customer booking form)
                </label>
              </div>

              <div className="p-5 border-t border-slate-100 shrink-0 flex gap-2 bg-white">
                <button
                  type="button"
                  onClick={closeCourierEditModal}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={courierSaving}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                  <Save size={16} />
                  {courierSaving ? "Saving..." : "Update"}
                </button>
              </div>
            </form>
          </div>
        </div>,
          document.body,
        )}

      {/* Delete Courier Confirm Modal */}
      {courierToDelete && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden overscroll-none">
          <div
            className="absolute inset-0 z-0"
            onClick={() => !courierDeleting && setCourierToDelete(null)}
            aria-hidden="true"
          />
          <div
            className="relative z-10 bg-white rounded-3xl border border-slate-100 shadow-xl max-w-sm w-full overflow-hidden p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">Delete Courier?</h3>
                <p className="text-sm text-slate-500 font-medium mt-1">
                  Remove <span className="font-black text-slate-800">{courierToDelete.name}</span> from
                  the booking list. This cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={courierDeleting}
                onClick={() => setCourierToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={courierDeleting}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  confirmDeleteCourier();
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50"
              >
                {courierDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <MapPicker
        isOpen={Boolean(courierMapPickerTarget)}
        onClose={() => setCourierMapPickerTarget(null)}
        onConfirm={handleCourierMapConfirm}
        initialLocation={
          activeCourierMapLocation?.lat && activeCourierMapLocation?.lng
            ? { lat: activeCourierMapLocation.lat, lng: activeCourierMapLocation.lng }
            : null
        }
        title="Select Courier Office Location"
        searchPlaceholder="Search courier branch area..."
        showRadius={false}
        preferCurrentLocationOnOpen={false}
      />
    </div>
  );
};

export default AdminParcelDashboard;
