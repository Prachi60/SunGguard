import React, { useState, useEffect, useCallback } from "react";
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
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { parcelApi } from "../../customer/services/parcelApi";
import { onParcelNew } from "@/core/services/orderSocket";
import { createSocketTokenReader } from "@core/utils/authStorage";
import { STORAGE_KEYS } from "@core/utils/storage";

const AdminParcelDashboard = () => {
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'active', 'pricing', 'reports'
  const [loading, setLoading] = useState(false);
  const [parcels, setParcels] = useState([]);
  const [riders, setRiders] = useState([]);
  const [assigningParcel, setAssigningParcel] = useState(null);
  const [selectedRiderId, setSelectedRiderId] = useState("");
  const [selectedParcel, setSelectedParcel] = useState(null);

  useEffect(() => {
    if (selectedParcel) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [selectedParcel]);

  // Pricing Config state
  const [pricing, setPricing] = useState({
    baseFare: 0,
    perKmCharge: 0,
    weightCharge: 0,
  });
  const [pricingSaving, setPricingSaving] = useState(false);

  // Reports state
  const [reports, setReports] = useState({
    totalDeliveries: 0,
    completed: 0,
    cancelled: 0,
    revenue: 0,
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

      // Fetch Pricing
      const pricingRes = await parcelApi.adminGetPricingConfig();
      if (pricingRes.data && pricingRes.data.success) {
        setPricing({
          baseFare: pricingRes.data.result.baseFare || 0,
          perKmCharge: pricingRes.data.result.perKmCharge || 0,
          weightCharge: pricingRes.data.result.weightCharge || 0,
        });
      }

      // Fetch Reports
      const reportsRes = await parcelApi.adminGetReports();
      if (reportsRes.data && reportsRes.data.success) {
        setReports(reportsRes.data.result);
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

      // Immediately fetch fully populated data in background
      fetchData(true);
    });

    return () => {
      unsubscribe();
    };
  }, [fetchData]);

  // Handle pricing update
  const handleUpdatePricing = async (e) => {
    e.preventDefault();
    setPricingSaving(true);
    try {
      const res = await parcelApi.adminUpdatePricingConfig(pricing);
      if (res.data && res.data.success) {
        toast.success("Pricing configuration updated successfully!");
        fetchData();
      } else {
        toast.error(res.data.message || "Failed to update pricing");
      }
    } catch (error) {
      toast.error("Failed to save pricing");
    } finally {
      setPricingSaving(false);
    }
  };

  // Handle Assigning Rider
  const handleAssignRiderSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRiderId) return toast.error("Please select a delivery partner");
    try {
      const res = await parcelApi.adminAssignRider({
        parcelId: assigningParcel,
        riderId: selectedRiderId
      });
      if (res.data && res.data.success) {
        toast.success("Rider assigned successfully!");
        setAssigningParcel(null);
        setSelectedRiderId("");
        fetchData();
      } else {
        toast.error(res.data.message || "Failed to assign rider");
      }
    } catch (error) {
      toast.error("Assignment failed");
    }
  };

  const getActiveParcels = () => {
    const activeStatuses = ["REQUESTED", "ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED", "PICKED_UP", "OUT_FOR_DELIVERY"];
    return parcels.filter(p => activeStatuses.includes(p.status));
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
        <div className="flex bg-slate-100 p-1 rounded-xl">
          {[
            { id: "all", label: "All Bookings", icon: ClipboardList },
            { id: "active", label: "Active Deliveries", icon: Activity },
            { id: "pricing", label: "Pricing Config", icon: Settings },
            { id: "reports", label: "Revenue Reports", icon: TrendingUp },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
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
                              "bg-blue-100 text-blue-700 animate-pulse"
                            }`}>
                              {parcel.status}
                            </span>

                            {parcel.deliveryPartnerId ? (
                              <div className="text-xs text-slate-500 font-medium mt-1">
                                Rider: {parcel.deliveryPartnerId.name}
                              </div>
                            ) : (
                              parcel.status !== "CANCELLED" && parcel.status !== "DELIVERED" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAssigningParcel(parcel._id);
                                  }}
                                  className="mt-2 text-xs bg-primary hover:bg-primary-dark text-white font-bold px-3 py-1 rounded-lg transition-all"
                                >
                                  Assign Rider
                                </button>
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
                  <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-bold">
                    {getActiveParcels().length} active
                  </span>
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
                              {parcel.status}
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setAssigningParcel(parcel._id);
                              }}
                              className="mt-2 text-xs bg-primary hover:bg-primary-dark text-white font-bold px-3 py-1 rounded-lg transition-all"
                            >
                              Assign Rider
                            </button>
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

          {/* TAB 3: PRICING CONFIG */}
          {activeTab === "pricing" && (
            <div className="max-w-md mx-auto bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Settings className="text-primary" size={18} /> Configure Pricing Model
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Dynamically adjust rates for parcel delivery bookings up to 1 KG.
                </p>
              </div>

              <form onSubmit={handleUpdatePricing} className="p-5 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Base Fare (₹)</label>
                  <input
                    type="number"
                    required
                    value={pricing.baseFare}
                    onChange={(e) => setPricing(p => ({ ...p, baseFare: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-slate-400 font-medium">Flat fee charged for every booking.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Per KM Charge (₹)</label>
                  <input
                    type="number"
                    required
                    value={pricing.perKmCharge}
                    onChange={(e) => setPricing(p => ({ ...p, perKmCharge: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-slate-400 font-medium">Added cost per kilometer calculated.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Weight Charge per KG (₹)</label>
                  <input
                    type="number"
                    required
                    value={pricing.weightCharge}
                    onChange={(e) => setPricing(p => ({ ...p, weightCharge: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-slate-400 font-medium">Added cost multiplied by package weight (Max 1 KG).</p>
                </div>

                <button
                  type="submit"
                  disabled={pricingSaving}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all mt-2"
                >
                  <Save size={16} />
                  {pricingSaving ? "Saving..." : "Save pricing config"}
                </button>
              </form>
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
                    <span className="text-slate-400 font-bold block uppercase">Admin Commision (20%)</span>
                    <span className="text-lg font-black text-slate-800 mt-1 block">
                      ₹{Math.round((reports.revenue * 0.2 + Number.EPSILON) * 100) / 100}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl">
                    <span className="text-slate-400 font-bold block uppercase">Riders Payout (80%)</span>
                    <span className="text-lg font-black text-slate-800 mt-1 block">
                      ₹{Math.round((reports.revenue * 0.8 + Number.EPSILON) * 100) / 100}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Assignment Modal */}
      {assigningParcel && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleAssignRiderSubmit} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl max-w-sm w-full space-y-4">
            <h3 className="text-lg font-black text-slate-800">Assign Delivery Partner</h3>
            <p className="text-xs text-slate-400">
              Select a verified rider to assign to booking request #{assigningParcel.slice(-6)}.
            </p>

            <select
              required
              value={selectedRiderId}
              onChange={(e) => setSelectedRiderId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 bg-white text-sm outline-none focus:border-primary"
            >
              <option value="">-- Choose Rider --</option>
              {riders.map((r) => {
                const statusStr = !r.isParcelService
                  ? "No Parcel Service"
                  : !r.isOnline
                  ? "Offline"
                  : r.isBusy
                  ? "Busy"
                  : "Available";
                return (
                  <option key={r._id} value={r._id}>
                    {r.name} ({r.phone}) — [{statusStr}]
                  </option>
                );
              })}
            </select>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setAssigningParcel(null); setSelectedRiderId(""); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-xs text-slate-600 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-primary hover:bg-primary-dark text-white font-bold text-xs rounded-xl transition-all"
              >
                Assign
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Selected Parcel Details Modal */}
      {selectedParcel && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
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
    </div>
  );
};

export default AdminParcelDashboard;
