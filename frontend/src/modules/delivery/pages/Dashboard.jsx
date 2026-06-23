import React, { useState, useEffect } from "react";
import {
  Bell,
  Star,
  TrendingUp,
  Package,
  MapPin,
  CheckCircle,
  XCircle,
  IndianRupee,
  AlertCircle,
  Camera,
  ShieldCheck,
  CheckCircle2,
  Lock,
  LogOut,
  RefreshCw,
  Clock,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";

import { useAuth } from "@core/context/AuthContext";
import { deliveryApi } from "../services/deliveryApi";
import { parcelApi } from "../../customer/services/parcelApi";
import { carWashApi } from "../../customer/services/carWashApi";
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from "@react-google-maps/api";
import { Sparkles } from "lucide-react";

const RiderParcelMap = ({ pickupAddress, dropAddress, status }) => {
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script-rider-parcel-tracking",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places"],
  });

  const [currentLocation, setCurrentLocation] = useState(null);
  const [directions, setDirections] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true }
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !window.google || !currentLocation) return;

    const isHeadingToPickup = ["ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED"].includes(status);
    const destCoords = isHeadingToPickup ? pickupAddress : dropAddress;

    if (!destCoords?.lat || !destCoords?.lng) return;

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: currentLocation,
        destination: { lat: Number(destCoords.lat), lng: Number(destCoords.lng) },
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);
        } else {
          console.error(`Directions request failed: ${status}`);
        }
      }
    );
  }, [isLoaded, currentLocation, status, pickupAddress.lat, pickupAddress.lng, dropAddress.lat, dropAddress.lng]);

  if (!isLoaded) {
    return (
      <div className="h-44 w-full bg-slate-100 rounded-2xl flex items-center justify-center animate-pulse">
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Loading Navigation Map...</span>
      </div>
    );
  }

  const isHeadingToPickup = ["ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED"].includes(status);
  const targetCoords = isHeadingToPickup ? pickupAddress : dropAddress;

  const center = currentLocation || {
    lat: Number(targetCoords.lat),
    lng: Number(targetCoords.lng),
  };

  const mapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-inner relative h-48 w-full z-10">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center}
        zoom={14}
        options={mapOptions}
      >
        {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: true }} />}

        {currentLocation && (
          <Marker
            position={currentLocation}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: "#3b82f6",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            }}
            title="Your Location"
          />
        )}

        <Marker
          position={{ lat: Number(targetCoords.lat), lng: Number(targetCoords.lng) }}
          label={{
            text: isHeadingToPickup ? "P" : "D",
            color: "white",
            fontWeight: "black",
          }}
          title={isHeadingToPickup ? `Pickup: ${pickupAddress.fullAddress}` : `Dropoff: ${dropAddress.fullAddress}`}
        />
      </GoogleMap>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();

  useEffect(() => {
    if (user && user.isCarWashService && !user.isParcelService) {
      navigate("/car-wash/partner/dashboard", { replace: true });
    }
  }, [user, navigate]);

  if (user && !user.isVerified) {
    return (
      <div className="min-h-screen bg-[#F0F4FF] flex flex-col justify-between p-6 relative overflow-hidden font-sans max-w-md mx-auto border-x border-gray-100 shadow-2xl">
        {/* Decorative Background Glows */}
        <div className="absolute top-[-10%] right-[-10%] h-[300px] w-[300px] rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] h-[300px] w-[300px] rounded-full bg-purple-200/30 blur-3xl" />

        {/* Top Header */}
        <header className="flex justify-between items-center py-4 relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-brand-100 bg-white shadow-sm">
              <img
                src={user.profileImage || "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900">{user.name}</h4>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                {user.isCarWashService ? "Car Wash Partner" : "Rider Partner"}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2 bg-white border border-gray-100 rounded-full hover:bg-gray-50 transition-colors text-gray-400 hover:text-gray-600 shadow-sm"
          >
            <LogOut size={16} />
          </button>
        </header>

        {/* Center content inside a white card */}
        <div className="flex-1 flex flex-col items-center justify-center my-8 text-center relative z-10 max-w-sm mx-auto bg-white rounded-[2rem] p-6 shadow-[0_16px_40px_rgba(99,102,241,0.06)] border border-brand-50">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="w-20 h-20 bg-amber-50 border border-amber-100 rounded-3xl flex items-center justify-center mb-6 shadow-sm"
          >
            <Clock size={36} className="text-amber-500 animate-pulse" />
          </motion.div>

          <h2 className="text-2xl font-black tracking-tight text-gray-900 mb-3">
            Application Under Review
          </h2>
          <p className="text-sm text-gray-400 leading-relaxed mb-6 font-medium">
            Your documents are currently being verified by our operations team. Approval usually takes less than 24 hours.
          </p>

          <div className="w-full space-y-4 bg-gray-50 border border-gray-100/50 rounded-2xl p-5 text-left">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 block ml-1">Verification Checklist</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[10px] text-emerald-600 font-bold">✓</div>
                <span className="text-xs font-bold text-gray-600">Identity & Documents Uploaded</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-[10px] text-amber-600 font-black animate-pulse">●</div>
                <span className="text-xs font-bold text-gray-600">Background Verification in Progress</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] text-gray-400 font-bold">-</div>
                <span className="text-xs font-semibold text-gray-400">Account Activation</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <footer className="space-y-3 relative z-10">
          <Button
            onClick={async () => {
              const res = await refreshUser();
              if (res?.isVerified) {
                toast.success("Congratulations! Your account has been verified.");
                window.location.reload();
              } else {
                toast.info("Verification is still in progress. Please check back later.");
              }
            }}
            variant="primary"
            className="w-full h-12 rounded-2xl font-black text-xs uppercase tracking-widest bg-black hover:bg-brand-700 text-white border-none shadow-lg shadow-brand-500/10"
          >
            <RefreshCw size={14} className="mr-2" />
            Refresh Status
          </Button>
          <div className="text-center text-[10px] font-bold text-gray-400 tracking-wider uppercase py-2">
            Support ID: #{user?._id ? user._id.slice(-6).toUpperCase() : "PENDING"}
          </div>
        </footer>
      </div>
    );
  }
  const [isOnline, setIsOnline] = useState(user?.isOnline || false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState(
    user?.isParcelService ? "delivery" : (user?.isCarWashService ? "car-wash" : "delivery")
  ); // 'delivery', 'return', 'parcel', 'car-wash'
  const [availableOrders, setAvailableOrders] = useState([]);
  const [assignedParcels, setAssignedParcels] = useState([]);
  const [availableWashes, setAvailableWashes] = useState([]);
  const [assignedWash, setAssignedWash] = useState(null);
  const [activeWashForOtp, setActiveWashForOtp] = useState(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [activeParcelForOtp, setActiveParcelForOtp] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [completionPhoto, setCompletionPhoto] = useState("");
  const [earnings, setEarnings] = useState({
    today: 0,
    deliveries: 0,
    incentives: 0,
    cashCollected: 0,
  });

  // Sync isOnline with user profile from context
  useEffect(() => {
    if (user) {
      setIsOnline(user.isOnline);
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      const response = await deliveryApi.getStats();
      if (response.data.success) {
        console.log("Stats Fetched:", response.data.result);
        setEarnings((prev) => ({
          ...prev,
          ...response.data.result,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch statistics:", error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await deliveryApi.getNotifications();
      if (response.data.success && response.data.result) {
        setUnreadCount(response.data.result.unreadCount || 0);
      }
    } catch (error) {
      console.error("Failed to fetch notifications");
    }
  };

  const fetchAvailableOrders = async () => {
    try {
      const response = await deliveryApi.getAvailableOrders({ type: activeTab });
      if (response.data.success) {
        const orders = response.data.results || response.data.result || [];
        setAvailableOrders(orders);
      }
    } catch (error) {
      console.error("Failed to fetch available orders:", error);
    }
  };

  const fetchAssignedParcels = async () => {
    try {
      const response = await parcelApi.riderGetAssigned();
      if (response.data.success) {
        setAssignedParcels(response.data.results || response.data.result || []);
      }
    } catch (error) {
      console.error("Failed to fetch assigned parcels:", error);
    }
  };

  const fetchAvailableWashes = async () => {
    try {
      const response = await carWashApi.partnerGetAvailable();
      if (response.data.success) {
        setAvailableWashes(response.data.results || response.data.result || []);
      }
    } catch (error) {
      console.error("Failed to fetch available washes:", error);
    }
  };

  const fetchAssignedWash = async () => {
    try {
      const response = await carWashApi.partnerGetAssigned();
      if (response.data.success) {
        setAssignedWash(response.data.result || null);
      }
    } catch (error) {
      console.error("Failed to fetch assigned wash:", error);
    }
  };

  const handleAcceptWash = async (bookingId) => {
    try {
      const response = await carWashApi.partnerAccept({ bookingId });
      if (response.data.success) {
        toast.success("Doorstep wash request accepted!");
        fetchAvailableWashes();
        fetchAssignedWash();
      } else {
        toast.error(response.data.message || "Failed to accept wash request");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to accept wash request");
    }
  };

  const handleUpdateWashStatus = async (bookingId, status, fileData = null) => {
    try {
      const formData = new FormData();
      formData.append("bookingId", bookingId);
      formData.append("status", status);
      if (fileData) {
        const blob = await fetch(fileData).then((r) => r.blob());
        formData.append("beforeWashImage", blob, "before-wash.jpg");
      }
      const response = await carWashApi.partnerUpdateStatus(formData);
      if (response.data.success) {
        toast.success(`Wash status updated to ${status}!`);
        fetchAssignedWash();
      } else {
        toast.error(response.data.message || "Failed to update status");
      }
    } catch (error) {
      toast.error("Status update request failed");
    }
  };

  const handleCompleteWashSubmit = async (e) => {
    e.preventDefault();
    if (!otpCode) return toast.error("Please enter the verification OTP");
    try {
      const formData = new FormData();
      formData.append("bookingId", activeWashForOtp._id);
      formData.append("otp", otpCode);
      if (completionPhoto) {
        const blob = await fetch(completionPhoto).then((r) => r.blob());
        formData.append("afterWashImage", blob, "after-wash.jpg");
      }
      const response = await carWashApi.partnerComplete(formData);
      if (response.data.success) {
        toast.success("Wash booking completed successfully!");
        setShowOtpModal(false);
        setActiveWashForOtp(null);
        setOtpCode("");
        setCompletionPhoto("");
        setAssignedWash(null);
        fetchStats();
      } else {
        toast.error(response.data.message || "Failed to complete booking");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Complete booking request failed");
    }
  };

  const handleUpdateParcelStatus = async (parcelId, status, fileData = null) => {
    try {
      const payload = { parcelId, status };
      if (fileData) {
        payload.pickupProofImage = fileData;
      }
      const response = await parcelApi.riderUpdateStatus(payload);
      if (response.data.success) {
        toast.success(`Parcel status updated to ${status}!`);
        fetchAssignedParcels();
      } else {
        toast.error(response.data.message || "Failed to update status");
      }
    } catch (error) {
      toast.error("Status update request failed");
    }
  };

  const handleUploadPhoto = (e, callback) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
      return toast.error("Photo size should be less than 2 MB");
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      callback(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCompleteParcelSubmit = async (e) => {
    e.preventDefault();
    if (!otpCode) return toast.error("Please enter the delivery OTP code");
    
    try {
      const response = await parcelApi.riderCompleteDelivery({
        parcelId: activeParcelForOtp._id,
        otp: otpCode,
        deliveryProofImage: completionPhoto
      });
      if (response.data.success) {
        toast.success("Delivery completed successfully!");
        setShowOtpModal(false);
        setActiveParcelForOtp(null);
        setOtpCode("");
        setCompletionPhoto("");
        fetchAssignedParcels();
        fetchStats();
      } else {
        toast.error(response.data.message || "Failed to verify OTP");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "OTP verification failed");
    }
  };

  useEffect(() => {
    fetchStats();
    fetchNotifications();
    if (isOnline) {
      if (activeTab === "parcel") {
        fetchAssignedParcels();
      } else if (activeTab === "car-wash") {
        fetchAvailableWashes();
        fetchAssignedWash();
      } else {
        fetchAvailableOrders();
      }
    }
  }, [isOnline, activeTab]);

  const handleOnlineToggle = async () => {
    const newStatus = !isOnline;
    try {
      await deliveryApi.updateProfile({ isOnline: newStatus });
      await refreshUser(); // Refresh global auth state
      setIsOnline(newStatus);
      if (newStatus) {
        toast.success("You are now ONLINE. Finding orders...");
      } else {
        toast.info("You are now OFFLINE. No new orders.");
      }
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleAcceptReturn = async (orderId) => {
    try {
      const response = await deliveryApi.acceptReturnPickup(orderId);
      if (response.data.success) {
        toast.success("Return pickup accepted!");
        fetchAvailableOrders();
        // Option: navigate to details
        navigate(`/delivery/order-details/${orderId}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to accept return");
    }
  };

  return (
    <div className="bg-gray-50/50 min-h-screen pb-24 relative overflow-hidden font-sans">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 pt-12 pb-4 flex justify-between items-center sticky top-0 z-30 transition-all duration-300">
        <div className="flex items-center space-x-3">
          <div
            className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary ring-2 ring-primary/20 shadow-sm cursor-pointer"
            onClick={() => navigate("/delivery/profile")}>
            <img
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </div>
          <div
            onClick={() => navigate("/delivery/profile")}
            className="cursor-pointer">
            <h2 className="ds-h2 leading-tight">
              {user?.name || "Delivery Partner"}
            </h2>
            <div className="flex items-center text-sm font-medium">
              <span className="flex items-center bg-yellow-50 text-yellow-600 px-1.5 py-0.5 rounded border border-yellow-100">
                <Star size={12} fill="currentColor" className="mr-1" />
                4.8
              </span>
              <span className="text-gray-300 mx-2">•</span>
              <span className="ds-caption text-gray-500">ID: 882190</span>
            </div>
          </div>
        </div>
        <div
          className="relative p-2.5 bg-gray-50 border border-gray-100 rounded-full hover:bg-gray-100 transition-colors cursor-pointer group"
          onClick={() => navigate("/delivery/notifications")}>
          <Bell
            size={20}
            className="text-gray-600 group-hover:text-primary transition-colors"
          />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 border-2 border-white rounded-full animate-pulse"></span>
          )}
        </div>
      </header>

      {/* Online/Offline Toggle */}
      <div className="px-6 py-6">
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 group">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Service Status</span>
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full animate-pulse",
                isOnline ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
              )} />
              <span className={cn(
                "text-[11px] font-bold uppercase tracking-wider",
                isOnline ? "text-emerald-600" : "text-rose-600"
              )}>
                {isOnline ? "Receiving Orders" : "Currently Offline"}
              </span>
            </div>
          </div>

          <div
            className="relative w-full h-14 bg-gray-100/80 rounded-2xl flex items-center p-1.5 cursor-pointer shadow-inner overflow-hidden border border-gray-200/50"
            onClick={handleOnlineToggle}
          >
            {/* Background Labels */}
            <div className="absolute inset-0 flex w-full">
              <div className="w-1/2 flex items-center justify-center">
                <span className={cn(
                  "text-[10px] font-black tracking-widest transition-opacity duration-300",
                  isOnline ? "opacity-0" : "opacity-40 text-gray-500"
                )}>SLIDE TO GO ONLINE</span>
              </div>
              <div className="w-1/2 flex items-center justify-center">
                <span className={cn(
                  "text-[10px] font-black tracking-widest transition-opacity duration-300",
                  !isOnline ? "opacity-0" : "opacity-40 text-gray-500"
                )}>SLIDE TO GO OFFLINE</span>
              </div>
            </div>

            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: 0 }} // We will use dragElastic for feel, but onDragEnd for logic
              dragElastic={0.1}
              onDragEnd={(_, info) => {
                const swipePower = info.offset.x;
                if (swipePower > 50 && !isOnline) {
                  handleOnlineToggle();
                } else if (swipePower < -50 && isOnline) {
                  handleOnlineToggle();
                }
              }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "w-1/2 h-full rounded-xl shadow-md flex items-center justify-center gap-2 z-10 border transition-all duration-500 cursor-grab active:cursor-grabbing",
                isOnline 
                  ? "bg-gradient-to-r from-primary to-[var(--brand-400)] border-[#389ecb] text-white" 
                  : "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-900 text-white"
              )}
              animate={{ x: isOnline ? "100%" : "0%" }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <motion.div
                initial={false}
                animate={{ rotate: isOnline ? 0 : 0 }}
              >
                {isOnline ? <CheckCircle size={18} strokeWidth={3} /> : <XCircle size={18} strokeWidth={3} />}
              </motion.div>
              <span className="text-xs font-black uppercase tracking-widest select-none">
                {isOnline ? "ONLINE" : "OFFLINE"}
              </span>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 mb-2">
        <div className="bg-gray-100 p-1.5 rounded-2xl flex gap-1 border border-gray-200 overflow-x-auto custom-scrollbar-none">
          {user?.isParcelService && (
            <>
              <button
                onClick={() => setActiveTab("delivery")}
                className={cn(
                  "flex-1 py-3 px-2 min-w-[70px] rounded-xl text-center text-[10px] font-black transition-all duration-300 uppercase tracking-widest",
                  activeTab === "delivery"
                    ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                )}
              >
                Deliveries
              </button>
              <button
                onClick={() => setActiveTab("return")}
                className={cn(
                  "flex-1 py-3 px-2 min-w-[70px] rounded-xl text-center text-[10px] font-black transition-all duration-300 uppercase tracking-widest",
                  activeTab === "return"
                    ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                )}
              >
                Returns
              </button>
              <button
                onClick={() => setActiveTab("parcel")}
                className={cn(
                  "flex-1 py-3 px-2 min-w-[70px] rounded-xl text-center text-[10px] font-black transition-all duration-300 uppercase tracking-widest",
                  activeTab === "parcel"
                    ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                )}
              >
                Parcels
              </button>
            </>
          )}
          {user?.isCarWashService && (
            <button
              onClick={() => setActiveTab("car-wash")}
              className={cn(
                "flex-1 py-3 px-2 min-w-[70px] rounded-xl text-center text-[10px] font-black transition-all duration-300 uppercase tracking-widest",
                activeTab === "car-wash"
                  ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
              )}
            >
              Washes
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 space-y-6">
        {/* Earnings Card */}
        <Card className="bg-white shadow-sm border border-gray-100 overflow-hidden relative">
          {/* Background Decoration */}
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/5 rounded-full blur-2xl"></div>

          <div className="flex justify-between items-center mb-4 relative z-10">
            <h3 className="ds-caption font-bold tracking-wider">
              Today's Earnings
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/delivery/earnings")}
              className="text-primary hover:text-primary/80 hover:bg-primary/5 h-8 px-3 text-xs font-bold rounded-full">
              View Details
            </Button>
          </div>

          <div className="flex items-baseline mb-6 relative z-10">
            <span className="text-2xl font-bold text-gray-400 mr-1">₹</span>
            <span className="text-4xl font-extrabold text-gray-900 tracking-tight">
              {earnings.today}
            </span>
            <span className="ml-3 text-brand-600 text-xs font-bold flex items-center bg-brand-50 border border-brand-100 px-2 py-1 rounded-full">
              <TrendingUp size={12} className="mr-1" /> +12%
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t border-gray-50 pt-4 relative z-10">
            <div className="text-center group cursor-pointer">
              <div className="flex justify-center mb-2 text-brand-600 bg-brand-50 group-hover:bg-brand-100 transition-colors w-10 h-10 rounded-full items-center mx-auto">
                <Package size={18} />
              </div>
              <p className="ds-caption mb-0.5">Orders</p>
              <p className="font-bold text-gray-900">{earnings.deliveries}</p>
            </div>
            <div className="text-center border-l border-r border-gray-50 group cursor-pointer">
              <div className="flex justify-center mb-2 text-amber-500 bg-amber-50 group-hover:bg-amber-100 transition-colors w-10 h-10 rounded-full items-center mx-auto">
                <Star size={18} />
              </div>
              <p className="ds-caption mb-0.5">Incentives</p>
              <p className="font-bold text-gray-900">₹{earnings.incentives}</p>
            </div>
            <div
              className="text-center group cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => navigate("/delivery/cod-cash")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") navigate("/delivery/cod-cash");
              }}
            >
              <div className="flex justify-center mb-2 text-brand-600 bg-brand-50 group-hover:bg-brand-100 transition-colors w-10 h-10 rounded-full items-center mx-auto">
                <IndianRupee size={18} />
              </div>
              <p className="ds-caption mb-0.5">COD Cash</p>
              <p className="font-bold text-gray-900">
                ₹{earnings.cashCollected}
              </p>
            </div>
          </div>
        </Card>

        {/* Active Order / Status */}
        <AnimatePresence mode="wait">
          {!isOnline ? (
            <motion.div
              key="offline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-gray-100">
                <AlertCircle size={32} className="text-gray-400" />
              </div>
              <h3 className="ds-h3 mb-2">You are Offline</h3>
              <p className="text-sm text-gray-500 max-w-[250px] mx-auto">
                Go online to start receiving delivery requests and earning
                money.
              </p>
            </motion.div>
          ) : activeTab === 'delivery' ? (
            availableOrders.length > 0 ? (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-6 border-2 border-primary/25 shadow-md shadow-primary/5 text-center">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Package className="text-primary" size={24} />
                  </div>
                </div>
                <h3 className="ds-h3 text-gray-900 mb-1">
                  {availableOrders.length === 1
                    ? "1 order waiting"
                    : `${availableOrders.length} orders waiting`}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed px-1">
                  A fullscreen alert will open with <strong>Accept</strong> and{" "}
                  <strong>Reject</strong>. Use that to respond before the timer
                  ends.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                  Listening for assignments
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="searching"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-brand-50/50 to-purple-50/50 opacity-50"></div>
                <div className="relative z-10">
                  <div className="relative w-24 h-24 mx-auto mb-6">
                    <div className="absolute inset-0 bg-brand-100 rounded-full animate-ping opacity-20"></div>
                    <div className="absolute inset-2 bg-brand-100 rounded-full animate-ping opacity-40 delay-150"></div>
                    <div className="relative w-full h-full bg-brand-50 rounded-full flex items-center justify-center border border-brand-100 shadow-sm">
                      <MapPin size={36} className="text-brand-600" />
                    </div>
                  </div>
                  <h3 className="ds-h3 mb-2 text-gray-800">
                    Finding Orders Nearby...
                  </h3>
                  <p className="text-sm text-gray-500 max-w-[220px] mx-auto mb-6">
                    We're looking for delivery requests in your area. Stay
                    online!
                  </p>
                </div>
              </motion.div>
            )
          ) : activeTab === 'return' ? (
            <motion.div
              key="returns-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-bold text-gray-800 tracking-tight">Available Return Pickups</h3>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase italic">Open for Acceptance</span>
              </div>
              {availableOrders.length > 0 ? (
                availableOrders.map((order) => (
                  <Card key={order._id} className="p-4 border-2 border-primary/5 hover:border-primary/20 transition-all shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-[10px] font-black text-primary/60 uppercase tracking-widest mb-1 block">Return Task</span>
                        <h4 className="font-bold text-gray-900">#{order.orderId}</h4>
                      </div>
                      <div className="text-right">
                        <span className="block font-black text-brand-600 text-lg">₹{order.returnDeliveryCommission || 0}</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Commission</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-5">
                      <div className="flex items-center text-xs text-gray-600">
                        <MapPin size={12} className="mr-2 text-gray-400" />
                        <span className="truncate">{order.seller?.shopName || "Store"}</span>
                      </div>
                      <div className="flex items-center text-[11px] text-gray-500 font-medium">
                        <Package size={12} className="mr-2 text-gray-400" />
                        <span>Pickup from Customer & Return to Store</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                       <Button 
                        variant="primary" 
                        size="sm" 
                        className="flex-1 font-black text-[10px] tracking-widest uppercase h-10 shadow-lg shadow-primary/20"
                        onClick={() => handleAcceptReturn(order.orderId)}
                      >
                        Accept Pickup
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="px-4 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 hover:bg-gray-100 h-10"
                        onClick={() => navigate(`/delivery/order-details/${order.orderId}`)}
                      >
                        View
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="bg-white rounded-2xl p-10 text-center border-2 border-dashed border-gray-100 flex flex-col items-center">
                  <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100 opacity-60">
                    <Package size={20} className="text-gray-400" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-800 mb-1">No returns nearby</h4>
                  <p className="text-[11px] text-gray-400">Keep checking back for new return tasks.</p>
                </div>
              )}
            </motion.div>
          ) : activeTab === 'parcel' ? (
              <motion.div
                key="parcels-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-sm font-bold text-gray-800 tracking-tight">Assigned Parcels</h3>
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase">
                    {assignedParcels.length} Active Tasks
                  </span>
                </div>

                {assignedParcels.length > 0 ? (
                  assignedParcels.map((parcel) => (
                    <Card key={parcel._id} className="p-5 border-2 border-primary/5 hover:border-primary/15 transition-all shadow-sm space-y-4 bg-white">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider block mb-0.5">Rider Payout (80%)</span>
                          <span className="text-base font-black text-slate-800 block">₹{(parcel.fare * 0.8).toFixed(2)}</span>
                          <span className="text-[10px] text-slate-400 font-bold block mt-1">ID: #{parcel._id.slice(-6)}</span>
                        </div>
                        <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full uppercase ${
                          parcel.status === 'ACCEPTED' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                          'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {parcel.status}
                        </span>
                      </div>

                      {["ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED", "PICKED_UP", "OUT_FOR_DELIVERY"].includes(parcel.status) && (
                        <RiderParcelMap
                          pickupAddress={parcel.pickupAddress}
                          dropAddress={parcel.dropAddress}
                          status={parcel.status}
                        />
                      )}

                      <div className="space-y-2.5 text-xs text-slate-600 border-t border-b border-slate-100 py-3">
                        <div>
                          <strong className="text-slate-800 block mb-0.5">Pickup:</strong>
                          <p>{parcel.pickupAddress.name} ({parcel.pickupAddress.phone})</p>
                          <p className="text-slate-400 mt-0.5">{parcel.pickupAddress.fullAddress}</p>
                        </div>
                        <div className="border-t border-slate-100 pt-2.5">
                          <strong className="text-slate-800 block mb-0.5">Dropoff:</strong>
                          <p>{parcel.dropAddress.name} ({parcel.dropAddress.phone})</p>
                          <p className="text-slate-400 mt-0.5">{parcel.dropAddress.fullAddress}</p>
                        </div>
                        <div className="border-t border-slate-100 pt-2.5">
                          <strong className="text-slate-800 block mb-0.5">Package:</strong>
                          <p className="uppercase font-bold">{parcel.packageDetails.packageType} ({parcel.weight} KG)</p>
                          {parcel.packageDetails.description && (
                            <p className="text-slate-400 italic mt-0.5">"{parcel.packageDetails.description}"</p>
                          )}
                        </div>
                      </div>

                      {/* Action buttons based on status */}
                      <div className="flex gap-2">
                        {parcel.status === "ACCEPTED" && (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full text-[10px] font-black uppercase tracking-wider h-10 shadow-md"
                            onClick={() => handleUpdateParcelStatus(parcel._id, "RIDER_ASSIGNED")}
                          >
                            Start Riding to Pickup
                          </Button>
                        )}

                        {parcel.status === "RIDER_ASSIGNED" && (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full text-[10px] font-black uppercase tracking-wider h-10 shadow-md"
                            onClick={() => handleUpdateParcelStatus(parcel._id, "PICKUP_REACHED")}
                          >
                            Mark Reached Pickup
                          </Button>
                        )}

                        {parcel.status === "PICKUP_REACHED" && (
                          <div className="w-full space-y-2">
                            <label className="w-full h-10 border border-dashed border-primary bg-primary/5 hover:bg-primary/10 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer text-[10px] font-black text-primary uppercase transition-all">
                              <Camera size={14} />
                              Upload Pickup Photo
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleUploadPhoto(e, (base64) => {
                                  handleUpdateParcelStatus(parcel._id, "PICKED_UP", base64);
                                })}
                              />
                            </label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-[10px] font-black uppercase tracking-wider h-9"
                              onClick={() => handleUpdateParcelStatus(parcel._id, "PICKED_UP")}
                            >
                              Skip Photo & Pick Up
                            </Button>
                          </div>
                        )}

                        {parcel.status === "PICKED_UP" && (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full text-[10px] font-black uppercase tracking-wider h-10 shadow-md"
                            onClick={() => handleUpdateParcelStatus(parcel._id, "OUT_FOR_DELIVERY")}
                          >
                            Start Delivery Ride
                          </Button>
                        )}

                        {parcel.status === "OUT_FOR_DELIVERY" && (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full text-[10px] font-black uppercase tracking-wider h-10 shadow-md bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              setActiveParcelForOtp(parcel);
                              setShowOtpModal(true);
                            }}
                          >
                            Verify OTP & Deliver
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))
                ) : (
                  <div className="bg-white rounded-2xl p-10 text-center border-2 border-dashed border-gray-100 flex flex-col items-center">
                    <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100 opacity-60">
                      <Package size={20} className="text-gray-400" />
                    </div>
                    <h4 className="text-sm font-bold text-gray-800 mb-1">No parcels assigned</h4>
                    <p className="text-[11px] text-gray-400">Once admin assigns you a parcel delivery, it will appear here.</p>
                  </div>
                )}
              </motion.div>
          ) : activeTab === 'car-wash' ? (
              <motion.div
                key="washes-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {!user?.isCarWashService ? (
                  <div className="bg-amber-50/50 rounded-2xl p-6 text-center border-2 border-dashed border-amber-200 flex flex-col items-center">
                    <div className="w-12 h-12 bg-amber-100/50 text-amber-600 rounded-full flex items-center justify-center mb-4 border border-amber-100">
                      <Sparkles size={20} />
                    </div>
                    <h4 className="text-sm font-bold text-amber-900 mb-1">Car Wash Service Inactive</h4>
                    <p className="text-xs text-amber-700/80 leading-relaxed mb-4 max-w-[250px]">
                      You have not enabled Doorstep Car Wash service. Go to your settings to activate it and receive jobs.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      className="font-black text-[10px] tracking-widest uppercase bg-amber-600 hover:bg-amber-700 h-9"
                      onClick={() => navigate("/delivery/profile/settings")}
                    >
                      Go to Settings
                    </Button>
                  </div>
                ) : assignedWash ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-1">
                      <h3 className="text-sm font-bold text-gray-800 tracking-tight">Active Wash Task</h3>
                      <span className="text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-full uppercase border border-cyan-100">
                        {assignedWash.status}
                      </span>
                    </div>

                    <Card className="p-5 border-2 border-cyan-100 hover:border-cyan-200 transition-all shadow-sm space-y-4 bg-white">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-black text-cyan-600 uppercase tracking-wider block mb-0.5">Rider Payout</span>
                          <span className="text-base font-black text-slate-800 block">₹{assignedWash.fare - assignedWash.commission}</span>
                          <span className="text-[10px] text-slate-400 font-bold block mt-1">ID: #{assignedWash.bookingId}</span>
                        </div>
                        <div className="text-right">
                          <span className="inline-block text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md uppercase">
                            {assignedWash.vehicleType}
                          </span>
                        </div>
                      </div>

                      {["ACCEPTED", "ARRIVED", "WASHING"].includes(assignedWash.status) && assignedWash.address?.lat && assignedWash.address?.lng && (
                        <RiderParcelMap
                          pickupAddress={assignedWash.address}
                          dropAddress={assignedWash.address}
                          status={assignedWash.status}
                        />
                      )}

                      <div className="space-y-2.5 text-xs text-slate-600 border-t border-b border-slate-100 py-3">
                        <div>
                          <strong className="text-slate-800 block mb-0.5">Customer Name & Phone:</strong>
                          <p>{assignedWash.customerId?.name || "Customer"} ({assignedWash.customerId?.phone || "N/A"})</p>
                        </div>
                        <div className="border-t border-slate-100 pt-2.5">
                          <strong className="text-slate-800 block mb-0.5">Wash Location:</strong>
                          <p className="text-slate-500">{assignedWash.address?.fullAddress}</p>
                        </div>
                        <div className="border-t border-slate-100 pt-2.5">
                          <strong className="text-slate-800 block mb-0.5">Package Details:</strong>
                          <p className="font-bold text-slate-700">{assignedWash.packageId?.name} ({assignedWash.packageId?.durationMinutes} Mins)</p>
                          <p className="text-slate-400 mt-0.5">{assignedWash.packageId?.description}</p>
                        </div>
                      </div>

                      {/* Action buttons based on status */}
                      <div className="flex gap-2">
                        {assignedWash.status === "ACCEPTED" && (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full text-[10px] font-black uppercase tracking-wider h-10 shadow-md bg-cyan-600 hover:bg-cyan-700 border-none"
                            onClick={() => handleUpdateWashStatus(assignedWash._id, "ARRIVED")}
                          >
                            Mark Arrived at Location
                          </Button>
                        )}

                        {assignedWash.status === "ARRIVED" && (
                          <div className="w-full space-y-2">
                            <label className="w-full h-10 border border-dashed border-cyan-500 bg-cyan-50/50 hover:bg-cyan-50 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer text-[10px] font-black text-cyan-600 uppercase transition-all">
                              <Camera size={14} />
                              Upload Before-Wash Photo
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleUploadPhoto(e, (base64) => {
                                  handleUpdateWashStatus(assignedWash._id, "WASHING", base64);
                                })}
                              />
                            </label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-[10px] font-black uppercase tracking-wider h-9"
                              onClick={() => handleUpdateWashStatus(assignedWash._id, "WASHING")}
                            >
                              Skip Photo & Start Washing
                            </Button>
                          </div>
                        )}

                        {assignedWash.status === "WASHING" && (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full text-[10px] font-black uppercase tracking-wider h-10 shadow-md bg-green-600 hover:bg-green-700 border-none"
                            onClick={() => {
                              setActiveWashForOtp(assignedWash);
                              setShowOtpModal(true);
                            }}
                          >
                            Verify OTP & Complete Wash
                          </Button>
                        )}
                      </div>
                    </Card>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-1">
                      <h3 className="text-sm font-bold text-gray-800 tracking-tight">Available Wash Requests</h3>
                      <span className="text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-full uppercase border border-cyan-100">
                        {availableWashes.length} Nearby
                      </span>
                    </div>

                    {availableWashes.length > 0 ? (
                      availableWashes.map((wash) => (
                        <Card key={wash._id} className="p-4 border-2 border-primary/5 hover:border-primary/20 transition-all shadow-sm">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <span className="text-[10px] font-black text-cyan-600 uppercase tracking-widest mb-1 block">Doorstep Wash</span>
                              <h4 className="font-bold text-slate-800">{wash.packageId?.name || "Wash Package"}</h4>
                              <span className="text-[10px] text-slate-400 font-bold block mt-0.5">Vehicle: <span className="uppercase text-slate-700">{wash.vehicleType}</span></span>
                            </div>
                            <div className="text-right">
                              <span className="block font-black text-brand-600 text-lg">₹{wash.fare - wash.commission}</span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Your Share</span>
                            </div>
                          </div>
                          
                          <div className="space-y-2 mb-5">
                            <div className="flex items-center text-xs text-gray-600">
                              <MapPin size={12} className="mr-2 text-cyan-500" />
                              <span className="truncate">{wash.address?.fullAddress}</span>
                            </div>
                            <div className="flex items-center text-[11px] text-gray-500 font-medium">
                              <Sparkles size={12} className="mr-2 text-cyan-400 animate-pulse" />
                              <span>Requires Before/After photos & Customer OTP verification</span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                             <Button 
                              variant="primary" 
                              size="sm" 
                              className="flex-1 font-black text-[10px] tracking-widest uppercase h-10 shadow-lg bg-cyan-600 hover:bg-cyan-700 text-white border-none"
                              onClick={() => handleAcceptWash(wash._id)}
                            >
                              Accept Job
                            </Button>
                          </div>
                        </Card>
                      ))
                    ) : (
                      <div className="bg-white rounded-2xl p-10 text-center border-2 border-dashed border-gray-100 flex flex-col items-center">
                        <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100 opacity-60">
                          <Sparkles size={20} className="text-cyan-400 animate-pulse" />
                        </div>
                        <h4 className="text-sm font-bold text-gray-800 mb-1">No wash requests nearby</h4>
                        <p className="text-[11px] text-gray-400">We're looking for wash bookings in your area. Keep checking back.</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* OTP Completion Modal */}
      {showOtpModal && (activeParcelForOtp || activeWashForOtp) && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form 
            onSubmit={activeWashForOtp ? handleCompleteWashSubmit : handleCompleteParcelSubmit} 
            className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 max-w-sm w-full space-y-4"
          >
            <div className="text-center space-y-2">
              <div className="h-12 w-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto border border-green-100">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-base font-black text-slate-800">Verify Job Completion OTP</h3>
              <p className="text-xs text-slate-400">
                {activeWashForOtp 
                  ? `Ask customer for the 4-digit OTP code to complete wash booking #${activeWashForOtp.bookingId}.`
                  : `Ask receiver for the 6-digit OTP code to complete booking #${activeParcelForOtp._id.slice(-6)}.`}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">OTP Code</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  maxLength={activeWashForOtp ? 4 : 6}
                  required
                  placeholder={activeWashForOtp ? "E.g. 1234" : "E.g. 123456"}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm font-bold text-slate-800 tracking-widest outline-none focus:border-green-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">
                {activeWashForOtp ? "After-Wash Photo (Optional)" : "Delivery Photo (Optional)"}
              </label>
              <label className="w-full h-10 border border-dashed border-slate-300 hover:bg-slate-50 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer text-xs font-bold text-slate-600 transition-all">
                <Camera size={14} />
                {completionPhoto ? "Photo Attached ✓" : activeWashForOtp ? "Upload After-Wash Photo" : "Upload Delivery Photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleUploadPhoto(e, setCompletionPhoto)}
                />
              </label>
              {completionPhoto && (
                <img src={completionPhoto} alt="Proof Preview" className="rounded-xl h-24 w-full object-cover border border-slate-200 mt-2" />
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowOtpModal(false);
                  setActiveParcelForOtp(null);
                  setActiveWashForOtp(null);
                  setOtpCode("");
                  setCompletionPhoto("");
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-xs text-slate-600 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl transition-all"
              >
                Verify & Complete
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
