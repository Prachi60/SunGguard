import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MapPin,
  Package,
  ArrowRight,
  TrendingUp,
  CreditCard,
  History,
  Truck,
  ShieldCheck,
  Search,
  CheckCircle2,
  Clock,
  User,
  Phone,
  FileText,
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  Building2,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { parcelApi } from '../services/parcelApi';
import MapPicker from '../../../shared/components/MapPicker';
import { useAuth } from '@core/context/AuthContext';
import { getOrderSocket, onParcelStatusUpdate } from '@/core/services/orderSocket';
import { createSocketTokenReader } from '@core/utils/authStorage';
import { STORAGE_KEYS } from '@core/utils/storage';
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';

const getCustomerToken = createSocketTokenReader(STORAGE_KEYS.AUTH_CUSTOMER);

const FALLBACK_COURIER_COMPANIES = [
  { id: '', name: 'Blue Dart', platformCharge: 0, companyCharge: 0 },
  { id: '', name: 'DTDC', platformCharge: 0, companyCharge: 0 },
  { id: '', name: 'Delhivery', platformCharge: 0, companyCharge: 0 },
  { id: '', name: 'India Post', platformCharge: 0, companyCharge: 0 },
  { id: '', name: 'Ekart', platformCharge: 0, companyCharge: 0 },
  { id: '', name: 'Ecom Express', platformCharge: 0, companyCharge: 0 },
  { id: '', name: 'XpressBees', platformCharge: 0, companyCharge: 0 },
  { id: '', name: 'FedEx', platformCharge: 0, companyCharge: 0 },
  { id: '', name: 'DHL', platformCharge: 0, companyCharge: 0 },
  { id: '', name: 'Shadowfax', platformCharge: 0, companyCharge: 0 },
];

const DESTINATION_CITIES = [
  { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { name: 'Delhi', lat: 28.6139, lng: 77.209 },
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946 },
  { name: 'Hyderabad', lat: 17.385, lng: 78.4867 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { name: 'Pune', lat: 18.5204, lng: 73.8567 },
  { name: 'Ahmedabad', lat: 23.0225, lng: 72.5714 },
  { name: 'Jaipur', lat: 26.9124, lng: 75.7873 },
  { name: 'Surat', lat: 21.1702, lng: 72.8311 },
  { name: 'Lucknow', lat: 26.8467, lng: 80.9462 },
  { name: 'Chandigarh', lat: 30.7333, lng: 76.7794 },
  { name: 'Indore', lat: 22.7196, lng: 75.8577 },
  { name: 'Bhopal', lat: 23.2599, lng: 77.4126 },
  { name: 'Nagpur', lat: 21.1458, lng: 79.0882 },
  { name: 'Patna', lat: 25.5941, lng: 85.1376 },
  { name: 'Kochi', lat: 9.9312, lng: 76.2673 },
  { name: 'Coimbatore', lat: 11.0168, lng: 76.9558 },
  { name: 'Visakhapatnam', lat: 17.6868, lng: 83.2185 },
  { name: 'Other', lat: 20.5937, lng: 78.9629 },
];

const PICKUP_WINDOWS = [
  { value: 'today', label: 'Today only', days: 0, helper: 'Book for today' },
  { value: '7_days', label: 'For 7 days', days: 7, helper: 'Book daily for 7 days' },
  { value: '15_days', label: 'For 15 days', days: 15, helper: 'Book daily for 15 days' },
  { value: '30_days', label: 'For 30 days', days: 30, helper: 'Book daily for 30 days' },
  { value: 'specific', label: 'Till a date', days: null, helper: 'Book until a specific date' },
];

const addDaysToDateInput = (days) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Number(days || 0));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const todayDateInputValue = () => addDaysToDateInput(0);

const getCityCoords = (cityName) =>
  DESTINATION_CITIES.find((c) => c.name === cityName) || null;

const formatInr = (value) => `₹${Number(value || 0).toFixed(0)}`;

/** Keeps dropdown menus inside the viewport (flips up + scrolls). */
const useInScreenMenu = (open, onClose, itemCount = 1, estimatedItemHeight = 48) => {
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  const updatePosition = useCallback(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const gutter = 8;
    const preferredHeight = Math.min(280, Math.max(160, itemCount * estimatedItemHeight + 8));
    const spaceBelow = window.innerHeight - rect.bottom - gutter;
    const spaceAbove = rect.top - gutter;
    const openUpward = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(preferredHeight, openUpward ? spaceAbove : spaceBelow));

    setMenuStyle({
      position: 'fixed',
      left: Math.max(gutter, Math.min(rect.left, window.innerWidth - rect.width - gutter)),
      width: rect.width,
      maxHeight,
      zIndex: 9999,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 6, top: 'auto' }
        : { top: rect.bottom + 6, bottom: 'auto' }),
    });
  }, [open, itemCount, estimatedItemHeight]);

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }
    updatePosition();
    const onReposition = () => updatePosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const inRoot = rootRef.current?.contains(event.target);
      const inList = listRef.current?.contains(event.target);
      if (!inRoot && !inList) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return { rootRef, listRef, menuStyle };
};

const CourierCompanySelect = ({ companies, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { rootRef, listRef, menuStyle } = useInScreenMenu(
    open,
    close,
    (companies?.length || 0) + 1,
    56,
  );

  const selected = useMemo(
    () =>
      companies.find((c) => (c.id && c.id === value) || c.name === value) || null,
    [companies, value],
  );

  const selectedValue = selected ? selected.id || selected.name : '';

  return (
    <div className="relative" ref={rootRef}>
      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-[1] pointer-events-none" size={14} />
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full rounded-xl border border-slate-200 pl-9 pr-10 py-2.5 text-sm bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary text-left min-h-[44px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className="flex items-center justify-between gap-2 pr-1">
            <span className="font-semibold text-slate-800 truncate">{selected.name}</span>
            <span className="flex items-center gap-1.5 shrink-0 text-[11px]">
              {Number(selected.companyCharge) > 0 && (
                <span className="text-slate-400 line-through decoration-slate-400">
                  {formatInr(selected.companyCharge)}
                </span>
              )}
              <span className="font-black text-primary">
                Platform {formatInr(selected.platformCharge)}
              </span>
            </span>
          </span>
        ) : (
          <span className="text-slate-400">Select courier company</span>
        )}
      </button>
      <ChevronDown
        size={16}
        className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-transform ${
          open ? 'rotate-180' : ''
        }`}
      />

      {open &&
        menuStyle &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            style={menuStyle}
            className="overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <button
              type="button"
              role="option"
              aria-selected={!selectedValue}
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="w-full px-3 py-2.5 text-left text-sm text-slate-400 hover:bg-slate-50 border-b border-slate-100"
            >
              Select courier company
            </button>
            {companies.map((company) => {
              const optionValue = company.id || company.name;
              const isSelected = optionValue === selectedValue;
              const companyFee = Number(company.companyCharge) || 0;
              const platformFee = Number(company.platformCharge) || 0;
              return (
                <button
                  key={optionValue}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(optionValue);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 text-left transition-colors border-b border-slate-50 last:border-b-0 ${
                    isSelected ? 'bg-primary/5' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`text-sm font-semibold truncate ${
                        isSelected ? 'text-primary' : 'text-slate-800'
                      }`}
                    >
                      {company.name}
                    </span>
                    <span className="flex flex-col items-end gap-0.5 shrink-0">
                      {companyFee > 0 && (
                        <span className="text-[11px] text-slate-400 line-through decoration-slate-400">
                          Courier {formatInr(companyFee)}
                        </span>
                      )}
                      <span className="text-[11px] font-black text-primary">
                        Platform {formatInr(platformFee)}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
            {companies.length === 0 && (
              <p className="px-3 py-4 text-xs text-slate-400 text-center">
                No courier companies available
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};

const DestinationCitySelect = ({ cities, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { rootRef, listRef, menuStyle } = useInScreenMenu(
    open,
    close,
    (cities?.length || 0) + 1,
    42,
  );

  return (
    <div className="relative" ref={rootRef}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-[1] pointer-events-none" size={14} />
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full rounded-xl border border-slate-200 pl-9 pr-10 py-2.5 text-sm bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary text-left min-h-[44px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {value ? (
          <span className="font-semibold text-slate-800">{value}</span>
        ) : (
          <span className="text-slate-400">Select city</span>
        )}
      </button>
      <ChevronDown
        size={16}
        className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-transform ${
          open ? 'rotate-180' : ''
        }`}
      />

      {open &&
        menuStyle &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            style={menuStyle}
            className="overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="w-full px-3 py-2.5 text-left text-sm text-slate-400 hover:bg-slate-50 border-b border-slate-100"
            >
              Select city
            </button>
            {cities.map((city) => {
              const isSelected = city.name === value;
              return (
                <button
                  key={city.name}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(city.name);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 text-left text-sm font-semibold border-b border-slate-50 last:border-b-0 ${
                    isSelected
                      ? 'bg-primary text-white'
                      : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {city.name}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
};

const formatParcelStatusLabel = (status) => {
  if (status === 'SEARCHING') return 'Searching for rider';
  if (status === 'REQUESTED') return 'Waiting for rider';
  return status;
};

const libraries = ["places"];

const LiveTrackingMap = ({ pickupAddress, dropAddress, deliveryPartner }) => {
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  const [directions, setDirections] = useState(null);

  useEffect(() => {
    if (!isLoaded || !window.google) return;

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: Number(pickupAddress.lat), lng: Number(pickupAddress.lng) },
        destination: { lat: Number(dropAddress.lat), lng: Number(dropAddress.lng) },
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
  }, [isLoaded, pickupAddress.lat, pickupAddress.lng, dropAddress.lat, dropAddress.lng]);

  if (!isLoaded) {
    return (
      <div className="h-64 md:h-80 w-full bg-slate-100 rounded-3xl flex items-center justify-center animate-pulse">
        <span className="text-xs text-slate-400 font-bold">Loading Live Map...</span>
      </div>
    );
  }

  const mapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  };

  const center = {
    lat: (Number(pickupAddress.lat) + Number(dropAddress.lat)) / 2,
    lng: (Number(pickupAddress.lng) + Number(dropAddress.lng)) / 2,
  };

  const riderCoordinates = deliveryPartner?.location?.coordinates;
  const riderPos =
    Array.isArray(riderCoordinates) && riderCoordinates.length === 2
      ? { lat: Number(riderCoordinates[1]), lng: Number(riderCoordinates[0]) }
      : null;

  return (
    <div className="rounded-3xl overflow-hidden border border-slate-100 shadow-md relative h-64 md:h-80 w-full z-10">
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center}
        zoom={12}
        options={mapOptions}
      >
        {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: true }} />}
        
        <Marker
          position={{ lat: Number(pickupAddress.lat), lng: Number(pickupAddress.lng) }}
          label={{
            text: "P",
            color: "white",
            fontWeight: "black",
          }}
          title={`Pickup: ${pickupAddress.fullAddress}`}
        />

        <Marker
          position={{ lat: Number(dropAddress.lat), lng: Number(dropAddress.lng) }}
          label={{
            text: "D",
            color: "white",
            fontWeight: "black",
          }}
          title={`Dropoff: ${dropAddress.fullAddress}`}
        />

        {riderPos && (
          <Marker
            position={riderPos}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#3b82f6",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            }}
            title={`Rider: ${deliveryPartner.name}`}
          />
        )}
      </GoogleMap>
    </div>
  );
};

const ParcelDeliveryPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "history" ? "history" : "book";
  const [activeTab, setActiveTab] = useState(initialTab); // 'book' or 'history'
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  
  // Form State
  const [pickupDetails, setPickupDetails] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    fullAddress: '',
    lat: null,
    lng: null
  });

  const [packageTypes, setPackageTypes] = useState([
    { value: "document", label: "Document / Paper" },
    { value: "food", label: "Food Items" },
    { value: "clothes", label: "Clothes / Fabric" },
    { value: "electronics", label: "Electronics" },
    { value: "other", label: "Other Packets" },
  ]);
  const [maxWeightKg, setMaxWeightKg] = useState(1);
  const [packageDescriptionPlaceholder, setPackageDescriptionPlaceholder] = useState(
    "E.g. keys, critical document papers...",
  );
  const [packageType, setPackageType] = useState("document");
  /** Display value only — do not clamp while typing so whole numbers work. */
  const [weightInput, setWeightInput] = useState("0.2");
  const [weightUnit, setWeightUnit] = useState("kg"); // 'kg' | 'gm'
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [courierCompanies, setCourierCompanies] = useState(FALLBACK_COURIER_COMPANIES);
  const [courierCompanyId, setCourierCompanyId] = useState('');
  const [destinationCity, setDestinationCity] = useState('');
  const [pickupWindow, setPickupWindow] = useState('today');
  const [preferredPickupDate, setPreferredPickupDate] = useState(todayDateInputValue());

  const selectedCity = useMemo(
    () => (destinationCity ? getCityCoords(destinationCity) : null),
    [destinationCity],
  );

  const selectedCourier = useMemo(
    () => courierCompanies.find((c) => (c.id && c.id === courierCompanyId) || c.name === courierCompanyId) || null,
    [courierCompanies, courierCompanyId],
  );

  const courierCompany = selectedCourier?.name || '';

  const selectedPickupWindow = useMemo(
    () => PICKUP_WINDOWS.find((w) => w.value === pickupWindow) || PICKUP_WINDOWS[0],
    [pickupWindow],
  );

  const handlePickupWindowChange = (value) => {
    setPickupWindow(value);
    const option = PICKUP_WINDOWS.find((w) => w.value === value);
    if (!option) return;
    if (option.value !== 'specific' && option.days != null) {
      setPreferredPickupDate(addDaysToDateInput(option.days));
    } else if (!preferredPickupDate || preferredPickupDate < todayDateInputValue()) {
      setPreferredPickupDate(todayDateInputValue());
    }
  };

  // Always in KG for fare API / booking payload.
  const weightKg = useMemo(() => {
    const n = parseFloat(String(weightInput).trim());
    if (!Number.isFinite(n) || n <= 0) return 0;
    const kg = weightUnit === "gm" ? n / 1000 : n;
    return Math.round((kg + Number.EPSILON) * 1000) / 1000;
  }, [weightInput, weightUnit]);
  // Alias so any leftover `weight` references don't crash the page.
  const weight = weightKg;

  // Fare Estimation
  const [fareEstimation, setFareEstimation] = useState(null);
  const [estimating, setEstimating] = useState(false);

  // Map Selection states
  const [mapPickerTarget, setMapPickerTarget] = useState(null); // 'pickup' only
  
  // Tracking state
  const [trackingParcel, setTrackingParcel] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Fetch history on load
  const fetchHistory = useCallback(async () => {
    try {
      const response = await parcelApi.getHistory();
      if (response.data && response.data.success) {
        setHistory(response.data.results || response.data.result || []);
      }
    } catch (error) {
      console.error("Failed to load history", error);
    }
  }, []);

  const fetchBookingConfig = useCallback(async () => {
    try {
      const response = await parcelApi.getBookingConfig();
      if (!response.data?.success) return;
      const cfg = response.data.result || {};
      const types = Array.isArray(cfg.packageTypes) ? cfg.packageTypes : [];
      if (types.length) {
        setPackageTypes(types);
        setPackageType((prev) =>
          types.some((t) => t.value === prev) ? prev : types[0].value,
        );
      }
      if (cfg.maxWeightKg != null) setMaxWeightKg(Number(cfg.maxWeightKg) || 1);
      if (cfg.packageDescriptionPlaceholder) {
        setPackageDescriptionPlaceholder(cfg.packageDescriptionPlaceholder);
      }
      if (Array.isArray(cfg.courierCompanies) && cfg.courierCompanies.length) {
        setCourierCompanies(
          cfg.courierCompanies.map((c) => ({
            id: String(c.id || c._id || ''),
            name: c.name,
            platformCharge: Number(c.platformCharge) || 0,
            companyCharge: Number(c.companyCharge) || 0,
          })),
        );
      }
    } catch (error) {
      console.error("Failed to load parcel booking config", error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    fetchBookingConfig();
  }, [fetchHistory, fetchBookingConfig]);

  useEffect(() => {
    const tab = searchParams.get("tab") === "history" ? "history" : "book";
    setActiveTab(tab);
    if (tab === "history") {
      setTrackingParcel(null);
      fetchHistory();
    }
  }, [searchParams, fetchHistory]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setTrackingParcel(null);
    if (tab === "history") {
      fetchHistory();
      setSearchParams({ tab: "history" }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  // Handle Fare Calculation when locations or weight change
  useEffect(() => {
    const calcFare = async () => {
      if (
        pickupDetails.lat &&
        pickupDetails.lng &&
        selectedCity?.lat &&
        selectedCity?.lng &&
        weightKg > 0
      ) {
        setEstimating(true);
        try {
          const res = await parcelApi.calculateFare({
            pickupLat: pickupDetails.lat,
            pickupLng: pickupDetails.lng,
            dropLat: selectedCity.lat,
            dropLng: selectedCity.lng,
            weight: weightKg,
            courierCompanyId: selectedCourier?.id || undefined,
            courierCompany: selectedCourier?.name || undefined,
          });
          if (res.data && res.data.success) {
            setFareEstimation(res.data.result);
          }
        } catch (error) {
          toast.error("Failed to calculate fare");
        } finally {
          setEstimating(false);
        }
      } else {
        setFareEstimation(null);
      }
    };

    const delayDebounce = setTimeout(calcFare, 500);
    return () => clearTimeout(delayDebounce);
  }, [pickupDetails.lat, pickupDetails.lng, selectedCity?.lat, selectedCity?.lng, weightKg, selectedCourier?.id, selectedCourier?.name]);

  // Map Selection Confirmation
  const handleMapConfirm = (location) => {
    if (mapPickerTarget === 'pickup') {
      setPickupDetails(prev => ({
        ...prev,
        fullAddress: location.address || '',
        lat: location.lat,
        lng: location.lng
      }));
      toast.success("Pickup location updated!");
    }
    setMapPickerTarget(null);
  };

  // Create Parcel request
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!pickupDetails.fullAddress || !pickupDetails.lat || !pickupDetails.lng) {
      return toast.error("Please select a valid Pickup address.");
    }
    if (!pickupDetails.name || !pickupDetails.phone) {
      return toast.error("Please enter sender details.");
    }
    if (weightKg <= 0 || weightKg > maxWeightKg) {
      return toast.error(
        `Weight must be between 0 and ${maxWeightKg} KG (or up to ${Math.round(maxWeightKg * 1000)} gm).`,
      );
    }
    if (!packageTypes.some((t) => t.value === packageType)) {
      return toast.error("Please select a valid package type.");
    }
    if (!selectedCourier) {
      return toast.error("Please select a courier company.");
    }
    if (!destinationCity || !selectedCity) {
      return toast.error("Please select destination city.");
    }
    if (!pickupWindow) {
      return toast.error("Please select how long you want to book for.");
    }
    if (!preferredPickupDate) {
      return toast.error("Please select preferred pickup date.");
    }
    if (preferredPickupDate < todayDateInputValue()) {
      return toast.error("Preferred pickup date cannot be in the past.");
    }

    const dropAddress = {
      name: courierCompany,
      phone: String(pickupDetails.phone || '').replace(/\D/g, '').slice(-10) || '0000000000',
      fullAddress: `${courierCompany} drop point, ${destinationCity}`,
      lat: selectedCity.lat,
      lng: selectedCity.lng,
    };

    const resolvedPickupDate =
      selectedPickupWindow.value === 'specific'
        ? preferredPickupDate
        : addDaysToDateInput(selectedPickupWindow.days);

    setLoading(true);
    try {
      const response = await parcelApi.createParcel({
        pickupAddress: pickupDetails,
        dropAddress,
        packageDetails: {
          packageType,
          weight: weightKg,
          description
        },
        courierCompany: selectedCourier.name,
        courierCompanyId: selectedCourier.id || undefined,
        destinationCity,
        pickupWindow: selectedPickupWindow.value,
        pickupWindowDays:
          selectedPickupWindow.value === 'specific' ? null : selectedPickupWindow.days,
        preferredPickupDate: resolvedPickupDate,
        paymentMethod
      });

      if (response.data && response.data.success) {
        toast.success("Parcel delivery requested successfully!");
        const createdParcel = response.data.result;
        // Reset form
        setDescription('');
        setCourierCompanyId('');
        setDestinationCity('');
        setPickupWindow('today');
        setPreferredPickupDate(todayDateInputValue());
        setWeightInput("0.2");
        setWeightUnit("kg");
        setFareEstimation(null);
        fetchHistory();
        navigate(`/parcel/search/${createdParcel._id}`);
      } else {
        toast.error(response.data.message || "Failed to create request");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Booking failed");
    } finally {
      setLoading(false);
    }
  };

  const handleTrackParcel = async (id) => {
    setTrackingLoading(true);
    try {
      const response = await parcelApi.trackParcel(id);
      if (response.data && response.data.success) {
        setTrackingParcel(response.data.result);
      } else {
        toast.error("Could not fetch tracking details");
      }
    } catch (error) {
      toast.error("Tracking request failed");
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    if (!trackingParcel) return;
    if (trackingParcel.status === 'DELIVERED' || trackingParcel.status === 'CANCELLED') return;

    const interval = setInterval(async () => {
      try {
        const response = await parcelApi.trackParcel(trackingParcel._id);
        if (response.data && response.data.success) {
          setTrackingParcel(response.data.result);
        }
      } catch (err) {
        console.error("Failed to poll tracking status", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [trackingParcel]);

  useEffect(() => {
    if (!trackingParcel?._id) return undefined;
    const getToken = getCustomerToken;
    getOrderSocket(getToken);
    return onParcelStatusUpdate(getToken, (payload) => {
      if (!payload?.parcelId || payload.parcelId !== trackingParcel._id) return;
      if (payload.parcel) {
        setTrackingParcel(payload.parcel);
        return;
      }
      if (payload.status) {
        setTrackingParcel((prev) => (prev ? { ...prev, status: payload.status } : prev));
      }
    });
  }, [trackingParcel?._id]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 font-outfit mt-4">
      {/* Header section */}
      {!trackingParcel ? (
        <div className="bg-gradient-to-r from-primary to-blue-600 rounded-3xl p-6 md:p-8 text-white shadow-xl mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-white/85 hover:text-white font-bold text-xs mb-4 transition-all hover:-translate-x-1"
            >
              <ChevronLeft size={16} /> Back to Home
            </button>
            <span className="bg-white/20 text-xs font-extrabold uppercase px-3 py-1.5 rounded-full tracking-widest">
              Up to {maxWeightKg} KG Only
            </span>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-3">
              Instant Parcel Delivery
            </h1>
            <p className="text-white/80 font-medium text-sm md:text-base mt-2 max-w-lg">
              Send documents, keys, food, or electronics instantly across the city. Smooth, secure, and fully tracked.
            </p>
          </div>
          <div className="flex gap-2 bg-white/10 p-1.5 rounded-2xl backdrop-blur-sm self-stretch md:self-auto justify-center">
            <button
              onClick={() => switchTab('book')}
              className={`flex-1 md:flex-initial px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                activeTab === 'book' && !trackingParcel
                  ? 'bg-white text-primary shadow-md'
                  : 'hover:bg-white/10 text-white'
              }`}
            >
              <Truck size={16} /> Book
            </button>
            <button
              onClick={() => switchTab('history')}
              className={`flex-1 md:flex-initial px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                activeTab === 'history' || trackingParcel
                  ? 'bg-white text-primary shadow-md'
                  : 'hover:bg-white/10 text-white'
              }`}
            >
              <History size={16} /> History & Status
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-5 p-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => switchTab('book')}
              className="px-3 py-2 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 text-slate-600 hover:bg-slate-100"
            >
              <Truck size={16} /> Book
            </button>
            <button
              onClick={() => switchTab('history')}
              className="px-3 py-2 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-slate-900 text-white"
            >
              <History size={16} /> History & Status
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!trackingParcel && activeTab === 'book' && (
        <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Form Side */}
          <div className="space-y-6">
            {/* Pickup Details Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <MapPin className="text-primary" size={20} /> Pickup Point
              </h2>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Sender Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      required
                      placeholder="Name"
                      value={pickupDetails.name}
                      onChange={(e) => setPickupDetails(p => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Sender Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="tel"
                      required
                      placeholder="Phone"
                      value={pickupDetails.phone}
                      onChange={(e) => setPickupDetails(p => ({ ...p, phone: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Full Pickup Address</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Address details, floor, apartment number..."
                  value={pickupDetails.fullAddress}
                  onChange={(e) => setPickupDetails(p => ({ ...p, fullAddress: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <button
                type="button"
                onClick={() => setMapPickerTarget('pickup')}
                className="w-full py-2.5 rounded-xl border border-dashed border-primary bg-primary/5 hover:bg-primary/10 text-primary font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <MapPin size={14} /> Choose on Map {pickupDetails.lat ? '✓ (Selected)' : ''}
              </button>
            </div>

            {/* Dropoff Details Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4 overflow-visible relative z-20">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <MapPin className="text-red-500" size={20} /> Dropoff Details
              </h2>

              <div className="space-y-1 relative z-30">
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Courier Company
                </label>
                <CourierCompanySelect
                  companies={courierCompanies}
                  value={courierCompanyId}
                  onChange={setCourierCompanyId}
                />
                <p className="text-[10px] text-slate-400 font-medium">
                  {selectedCourier
                    ? (
                      <>
                        {Number(selectedCourier.companyCharge) > 0 && (
                          <>
                            Courier{' '}
                            <span className="line-through text-slate-400">
                              {formatInr(selectedCourier.companyCharge)}
                            </span>
                            {' · '}
                          </>
                        )}
                        Platform{' '}
                        <span className="font-bold text-primary">
                          {formatInr(selectedCourier.platformCharge)}
                        </span>
                      </>
                    )
                    : 'Which courier company should receive this parcel?'}
                </p>
              </div>

              <div className="space-y-1 relative z-20">
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Destination City
                </label>
                <DestinationCitySelect
                  cities={DESTINATION_CITIES}
                  value={destinationCity}
                  onChange={setDestinationCity}
                />
                <p className="text-[10px] text-slate-400 font-medium">
                  Which city should this parcel go to?
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Book for how long?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PICKUP_WINDOWS.map((windowOption) => (
                    <button
                      key={windowOption.value}
                      type="button"
                      onClick={() => handlePickupWindowChange(windowOption.value)}
                      className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                        pickupWindow === windowOption.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-slate-100 bg-white text-slate-700 hover:border-slate-200'
                      }`}
                    >
                      <span className="block text-xs font-black">{windowOption.label}</span>
                      <span className={`block text-[10px] mt-0.5 font-medium ${
                        pickupWindow === windowOption.value ? 'text-primary/70' : 'text-slate-400'
                      }`}>
                        {windowOption.helper}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 font-medium">
                  {selectedPickupWindow.helper}. Choose today, 7, 15, or 30 days.
                </p>
              </div>

              {pickupWindow === 'specific' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Book until date
                  </label>
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="date"
                      required
                      min={todayDateInputValue()}
                      max={addDaysToDateInput(30)}
                      value={preferredPickupDate}
                      onChange={(e) => setPreferredPickupDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              )}

              {pickupWindow !== 'specific' && (
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 flex items-start gap-2">
                  <Clock className="text-primary shrink-0 mt-0.5" size={14} />
                  <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                    {selectedPickupWindow.days > 0 ? (
                      <>
                        Booking for{' '}
                        <span className="font-bold text-slate-800">
                          {selectedPickupWindow.days} days
                        </span>
                        {' '}— pickup available every day till{' '}
                        <span className="font-bold text-slate-800">
                          {new Date(addDaysToDateInput(selectedPickupWindow.days)).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                        .
                      </>
                    ) : (
                      <>
                        Booking for{' '}
                        <span className="font-bold text-slate-800">today only</span>.
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Package Side & Price */}
          <div className="space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Package Details */}
              <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Package className="text-primary" size={20} /> Package Details
                </h2>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Package Type</label>
                    <select
                      value={packageType}
                      onChange={(e) => setPackageType(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white outline-none focus:border-primary"
                    >
                      {packageTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">
                      Weight (Max {weightUnit === "gm" ? `${Math.round(maxWeightKg * 1000)} gm` : `${maxWeightKg} KG`})
                    </label>
                    <div className="flex items-stretch gap-2 w-full">
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        placeholder={weightUnit === "gm" ? "e.g. 500" : "e.g. 1"}
                        value={weightInput}
                        onChange={(e) => {
                          let next = e.target.value;
                          if (weightUnit === "gm") {
                            next = next.replace(/\D/g, "").slice(0, 4);
                          } else {
                            next = next.replace(/[^\d.]/g, "");
                            const parts = next.split(".");
                            if (parts.length > 2) {
                              next = `${parts[0]}.${parts.slice(1).join("")}`;
                            }
                            if (parts[1]?.length > 3) {
                              next = `${parts[0]}.${parts[1].slice(0, 3)}`;
                            }
                          }
                          setWeightInput(next);
                        }}
                        className="flex-1 min-w-[140px] w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base font-semibold text-slate-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                      <select
                        value={weightUnit}
                        onChange={(e) => {
                          const nextUnit = e.target.value;
                          const n = parseFloat(weightInput);
                          if (Number.isFinite(n) && n > 0) {
                            if (nextUnit === "gm" && weightUnit === "kg") {
                              setWeightInput(String(Math.round(n * 1000)));
                            } else if (nextUnit === "kg" && weightUnit === "gm") {
                              const kg = n / 1000;
                              setWeightInput(
                                Number.isInteger(kg) ? String(kg) : String(Math.round(kg * 1000) / 1000),
                              );
                            }
                          }
                          setWeightUnit(nextUnit);
                        }}
                        className="w-[96px] shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-primary bg-white"
                      >
                        <option value="kg">KG</option>
                        <option value="gm">GM</option>
                      </select>
                    </div>
                    {weightKg > 0 && weightUnit === "gm" && (
                      <p className="text-[10px] text-slate-400 font-medium">= {weightKg} KG</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Package Description</label>
                  <textarea
                    rows={2}
                    placeholder={packageDescriptionPlaceholder}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Payment Methods */}
              <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <CreditCard className="text-primary" size={20} /> Payment Option
                </h2>

                <div className="grid grid-cols-2 gap-3">
                  {['COD', 'UPI', 'CARD', 'WALLET'].map((method) => (
                    <label
                      key={method}
                      className={`border-2 rounded-2xl p-3 flex items-center justify-between cursor-pointer transition-all hover:bg-slate-50 ${
                        paymentMethod === method ? 'border-primary bg-primary/5' : 'border-slate-100'
                      }`}
                    >
                      <div>
                        <span className="text-sm font-bold text-slate-800 uppercase">{method}</span>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {method === 'COD' ? 'Cash on pickup/drop' : method === 'WALLET' ? 'System Wallet' : 'Instant Online'}
                        </p>
                      </div>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method}
                        checked={paymentMethod === method}
                        onChange={() => setPaymentMethod(method)}
                        className="accent-primary h-4 w-4"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Price Estimator & Place Order */}
            <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl mt-6 space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Total Estimation</span>
                  {estimating ? (
                    <div className="h-10 flex items-center">
                      <span className="animate-pulse text-sm text-slate-400">Estimating...</span>
                    </div>
                  ) : (
                    <div className="text-3xl font-black text-white mt-1">
                      ₹{fareEstimation ? Number(fareEstimation.fare).toFixed(2) : '0.00'}
                    </div>
                  )}
                </div>
                {fareEstimation && (
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Distance</span>
                    <div className="text-lg font-bold text-white mt-0.5">{fareEstimation.distance} KM</div>
                  </div>
                )}
              </div>

              {fareEstimation && (
                <div className="border-t border-b border-white/10 py-3 space-y-2 text-xs text-slate-300 font-medium">
                  <div className="flex justify-between">
                    <span>Base Fare</span>
                    <span>₹{Number(fareEstimation.baseFare).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Distance Fare ({fareEstimation.distance} km)</span>
                    <span>₹{Number(fareEstimation.distanceFare).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Weight Charge ({weightKg} kg)</span>
                    <span>₹{Number(fareEstimation.weightFare).toFixed(2)}</span>
                  </div>
                  {Number(fareEstimation.courierCharge) > 0 && (
                    <>
                      {Number(fareEstimation.companyCharge) > 0 && (
                        <div className="flex justify-between">
                          <span>Courier Company Fee</span>
                          <span>₹{Number(fareEstimation.companyCharge).toFixed(2)}</span>
                        </div>
                      )}
                      {Number(fareEstimation.platformCharge) > 0 && (
                        <div className="flex justify-between">
                          <span>Platform Charge</span>
                          <span>₹{Number(fareEstimation.platformCharge).toFixed(2)}</span>
                        </div>
                      )}
                      {!Number(fareEstimation.companyCharge) && !Number(fareEstimation.platformCharge) && (
                        <div className="flex justify-between">
                          <span>Courier Platform ({courierCompany || 'Selected'})</span>
                          <span>₹{Number(fareEstimation.courierCharge).toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {!pickupDetails.lat || !selectedCity ? (
                <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 rounded-2xl p-3 text-xs font-semibold">
                  <AlertTriangle size={14} className="shrink-0" />
                  Please select pickup location and destination city to view distance & fare estimates.
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading || estimating || !pickupDetails.lat || !selectedCity || !selectedCourier}
                className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                {loading ? 'Processing Book...' : 'Request Delivery'}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </form>
      )}

      {/* History & Active Orders Tab */}
      {!trackingParcel && activeTab === 'history' && (
        <div className="space-y-4">
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-2">
            <History className="text-primary" size={22} /> Delivery Requests
          </h2>

          {history.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-100 text-center space-y-3">
              <div className="h-16 w-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <Package size={32} />
              </div>
              <p className="text-slate-800 font-bold text-lg">No parcel requests found</p>
              <p className="text-slate-400 text-sm max-w-sm mx-auto">
                You haven't requested any parcel deliveries yet. Create your first request above!
              </p>
              <button
                onClick={() => switchTab('book')}
                className="px-6 py-2.5 bg-primary text-white font-bold text-sm rounded-xl hover:bg-primary-dark transition-all"
              >
                Book a Delivery
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {history.map((parcel) => (
                <div key={parcel._id} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        ID: ...{parcel._id.slice(-6)}
                      </span>
                      <span className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase ${
                        parcel.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                        parcel.status === 'CANCELLED' ? 'bg-red-100 text-red-600' :
                        parcel.status === 'SEARCHING' ? 'bg-amber-100 text-amber-700 animate-pulse' :
                        'bg-blue-100 text-blue-700 animate-pulse'
                      }`}>
                        {formatParcelStatusLabel(parcel.status)}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <MapPin size={14} className="text-primary shrink-0 mt-0.5" />
                        <div className="text-xs text-slate-600 line-clamp-1">
                          <strong className="text-slate-800">From:</strong> {parcel.pickupAddress.fullAddress}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <MapPin size={14} className="text-red-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-slate-600 line-clamp-1">
                          <strong className="text-slate-800">To:</strong>{' '}
                          {parcel.courierCompany
                            ? `${parcel.courierCompany}${parcel.destinationCity ? `, ${parcel.destinationCity}` : ''}`
                            : parcel.dropAddress?.fullAddress || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase">Fare</span>
                      <span className="text-base font-black text-slate-900">₹{parcel.fare}</span>
                    </div>
                    
                    <button
                      onClick={() => handleTrackParcel(parcel._id)}
                      className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl transition-all"
                    >
                      Track & Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Live tracking details sub-page */}
      {trackingParcel && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-100 shadow-lg space-y-4 sm:space-y-6">
          <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 pb-3 sm:pb-4">
            <button
              onClick={() => { setTrackingParcel(null); fetchHistory(); }}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <ChevronLeft size={20} className="text-slate-700" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-black text-slate-800">
                Track Delivery Request
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5 break-all">
                ID: {trackingParcel._id}
              </p>
            </div>
            <span className={`text-[11px] sm:text-xs font-black px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full uppercase whitespace-nowrap ${
              trackingParcel.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
              trackingParcel.status === 'CANCELLED' ? 'bg-red-100 text-red-600' :
              trackingParcel.status === 'SEARCHING' ? 'bg-amber-100 text-amber-700 animate-pulse' :
              'bg-blue-100 text-blue-700'
            }`}>
              {formatParcelStatusLabel(trackingParcel.status)}
            </span>
          </div>

          {(trackingParcel.status === 'SEARCHING' || trackingParcel.status === 'REQUESTED') && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
              <Clock className="text-amber-600 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-black text-amber-900">Finding a nearby rider</p>
                <p className="text-xs text-amber-700 font-medium mt-1">
                  Available parcel delivery partners are being notified. The first rider to accept will be assigned to your booking.
                </p>
              </div>
            </div>
          )}

          <LiveTrackingMap
            pickupAddress={trackingParcel.pickupAddress}
            dropAddress={trackingParcel.dropAddress}
            deliveryPartner={trackingParcel.deliveryPartnerId}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 lg:gap-8">
            {/* Tracking Progress */}
            <div className="space-y-6">
              {/* OTP code warning */}
              {trackingParcel.status !== 'DELIVERED' && trackingParcel.status !== 'CANCELLED' && (
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-5 text-white flex justify-between items-center shadow-md">
                  <div>
                    <span className="text-[10px] font-black uppercase text-white/70 tracking-widest">
                      Delivery Verification OTP
                    </span>
                    <p className="text-xs text-white/90 font-medium mt-1">
                      Share this OTP with the rider to verify delivery completion.
                    </p>
                  </div>
                  <div className="text-3xl font-black tracking-widest bg-white/10 px-4 py-2 rounded-xl border border-white/20">
                    {trackingParcel.otp}
                  </div>
                </div>
              )}

              {/* Status Flow Display */}
              <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 space-y-4">
                <h3 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider">
                  Status History
                </h3>
                <div className="relative pl-5 sm:pl-6 space-y-5 sm:space-y-6 border-l-2 border-slate-200">
                  {[
                    { key: 'REQUESTED', label: 'Requested', desc: 'Booking requested by customer.' },
                    { key: 'SEARCHING', label: 'Searching for rider', desc: 'Notifying nearby parcel riders.' },
                    { key: 'ACCEPTED', label: 'Accepted', desc: 'Rider confirmed acceptance.' },
                    { key: 'RIDER_ASSIGNED', label: 'Rider Assigned', desc: 'Rider is on the way.' },
                    { key: 'PICKUP_REACHED', label: 'Rider Reached Pickup', desc: 'Rider reached the pickup point.' },
                    { key: 'PICKED_UP', label: 'Picked Up', desc: 'Rider has picked up the packet.' },
                    { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', desc: 'Rider is heading to drop location.' },
                    { key: 'DELIVERED', label: 'Delivered Successfully', desc: 'Packet delivered to dropoff location.' }
                  ].map((step, idx) => {
                    const statuses = [
                      'REQUESTED',
                      'SEARCHING',
                      'ACCEPTED',
                      'RIDER_ASSIGNED',
                      'PICKUP_REACHED',
                      'PICKED_UP',
                      'OUT_FOR_DELIVERY',
                      'DELIVERED'
                    ];
                    const currentIdx = statuses.indexOf(trackingParcel.status);
                    const stepIdx = statuses.indexOf(step.key);
                    const isDone = stepIdx <= currentIdx && trackingParcel.status !== 'CANCELLED';
                    const isCurrent = stepIdx === currentIdx && trackingParcel.status !== 'CANCELLED';

                    return (
                      <div key={step.key} className="relative">
                        <div className={`absolute -left-[27px] sm:-left-[31px] top-0.5 h-4 w-4 rounded-full border-2 bg-white flex items-center justify-center transition-all ${
                          isCurrent ? 'border-primary ring-4 ring-primary/20 scale-110' :
                          isDone ? 'border-primary bg-primary' : 'border-slate-300'
                        }`}>
                          {isDone && !isCurrent && <div className="h-1.5 w-1.5 bg-white rounded-full" />}
                        </div>
                        <div>
                          <h4 className={`text-[11px] sm:text-xs font-bold ${isCurrent ? 'text-primary' : isDone ? 'text-slate-800' : 'text-slate-400'}`}>
                            {step.label}
                          </h4>
                          <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-4">
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Address & Package Info Card */}
            <div className="space-y-6">
              <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 space-y-4">
                <h3 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider">
                  Parcel Overview
                </h3>

                <div className="space-y-3">
                  <div className="flex gap-2">
                    <MapPin className="text-primary shrink-0 mt-0.5" size={16} />
                    <div>
                      <strong className="text-xs text-slate-800 block">Pickup details:</strong>
                      <span className="text-xs text-slate-600">{trackingParcel.pickupAddress.name} ({trackingParcel.pickupAddress.phone})</span>
                      <p className="text-xs text-slate-500 mt-0.5">{trackingParcel.pickupAddress.fullAddress}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 border-t border-slate-200/50 pt-3">
                    <Building2 className="text-red-500 shrink-0 mt-0.5" size={16} />
                    <div>
                      <strong className="text-xs text-slate-800 block">Dropoff details:</strong>
                      {trackingParcel.courierCompany && (
                        <p className="text-xs text-slate-600 mt-0.5">
                          Courier: <span className="font-bold">{trackingParcel.courierCompany}</span>
                        </p>
                      )}
                      {trackingParcel.destinationCity && (
                        <p className="text-xs text-slate-600 mt-0.5">
                          City: <span className="font-bold">{trackingParcel.destinationCity}</span>
                        </p>
                      )}
                      {trackingParcel.preferredPickupDate && (
                        <p className="text-xs text-slate-600 mt-0.5">
                          Booked for:{' '}
                          <span className="font-bold">
                            {trackingParcel.pickupWindow === 'today'
                              ? 'Today only'
                              : trackingParcel.pickupWindow === '7_days'
                                ? 'Booked for 7 days'
                                : trackingParcel.pickupWindow === '15_days'
                                  ? 'Booked for 15 days'
                                  : trackingParcel.pickupWindow === '30_days'
                                    ? 'Booked for 30 days'
                                    : trackingParcel.pickupWindow === 'specific'
                                      ? 'Till a date'
                                      : 'Scheduled'}
                            {' · '}
                            {trackingParcel.pickupWindow && trackingParcel.pickupWindow !== 'specific' && trackingParcel.pickupWindow !== 'today'
                              ? `till ${new Date(trackingParcel.preferredPickupDate).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}`
                              : new Date(trackingParcel.preferredPickupDate).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                          </span>
                        </p>
                      )}
                      {!trackingParcel.courierCompany && !trackingParcel.destinationCity && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {trackingParcel.dropAddress?.fullAddress || '—'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 border-t border-slate-200/50 pt-3">
                    <Package className="text-slate-600 shrink-0 mt-0.5" size={16} />
                    <div>
                      <strong className="text-xs text-slate-800 block">Package details:</strong>
                      <span className="text-xs text-slate-600 uppercase font-bold">{trackingParcel.packageDetails.packageType}</span>
                      <p className="text-xs text-slate-500 mt-0.5">Weight: {trackingParcel.weight} KG</p>
                      {trackingParcel.packageDetails.description && (
                        <p className="text-xs text-slate-400 mt-0.5 italic">"{trackingParcel.packageDetails.description}"</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rider Details Card */}
              {trackingParcel.deliveryPartnerId ? (
                <div className="bg-white rounded-2xl p-5 border border-slate-200 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 overflow-hidden">
                    {trackingParcel.deliveryPartnerId.profileImage ? (
                      <img src={trackingParcel.deliveryPartnerId.profileImage} alt="rider" className="h-full w-full object-cover" />
                    ) : (
                      <User className="text-slate-500" size={24} />
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Rider</span>
                    <h4 className="text-sm font-black text-slate-800 mt-0.5">
                      {trackingParcel.deliveryPartnerId.name}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                      <Phone size={12} /> {trackingParcel.deliveryPartnerId.phone}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200 text-center space-y-2">
                  <Clock className="text-amber-500 mx-auto animate-pulse" size={24} />
                  <h4 className="text-sm font-bold text-amber-800">
                    Finding Delivery Partner
                  </h4>
                  <p className="text-xs text-amber-600 max-w-xs mx-auto font-medium">
                    We've notified delivery partners nearby. Once accepted, rider info will update here.
                  </p>
                </div>
              )}

              {/* Proof Images */}
              {(trackingParcel.pickupProofImage || trackingParcel.deliveryProofImage) && (
                <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                    Delivery Proofs
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {trackingParcel.pickupProofImage && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Pickup Photo</span>
                        <img src={trackingParcel.pickupProofImage} alt="Pickup Proof" className="rounded-xl h-24 w-full object-cover border border-slate-200" />
                      </div>
                    )}
                    {trackingParcel.deliveryProofImage && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Delivery Photo</span>
                        <img src={trackingParcel.deliveryProofImage} alt="Delivery Proof" className="rounded-xl h-24 w-full object-cover border border-slate-200" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Map Picker Modal */}
      {mapPickerTarget && (
        <MapPicker
          isOpen={true}
          onClose={() => setMapPickerTarget(null)}
          onConfirm={handleMapConfirm}
          initialLocation={pickupDetails}
          preferCurrentLocationOnOpen={true}
          title="Select Pickup Location"
          searchPlaceholder="Search for pickup area..."
          showRadius={false}
        />
      )}
    </div>
  );
};

export default ParcelDeliveryPage;
