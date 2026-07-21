import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Package,
  ArrowRight,
  CreditCard,
  Truck,
  Clock,
  User,
  Phone,
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  Building2,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { parcelApi } from '../services/parcelApi';
import MapPicker from '../../../shared/components/MapPicker';
import { composeCourierFullAddress } from '../../admin/utils/courierLocation';
import { useAuth } from '@core/context/AuthContext';

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
            <span className="shrink-0 text-[11px] font-black text-primary">
              Platform {formatInr(selected.platformCharge)}
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
                    <span className="text-[11px] font-black text-primary shrink-0">
                      Platform {formatInr(platformFee)}
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

const ParcelDeliveryPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Form State
  const [pickupDetails, setPickupDetails] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    address: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',
    fullAddress: '',
    lat: null,
    lng: null
  });

  const composePickupFullAddress = (details) =>
    [
      details.address?.trim(),
      details.landmark?.trim() ? `Near ${details.landmark.trim()}` : '',
      details.city?.trim(),
      details.state?.trim(),
      details.pincode?.trim(),
    ]
      .filter(Boolean)
      .join(', ');

  const updatePickupField = (field, value) => {
    setPickupDetails((prev) => {
      const next = { ...prev, [field]: value };
      next.fullAddress = composePickupFullAddress(next);
      return next;
    });
  };

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
    fetchBookingConfig();
  }, [fetchBookingConfig]);

  // Handle Fare Calculation when locations, weight, courier, or booking duration change
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
            pickupWindow: selectedPickupWindow.value,
            pickupWindowDays:
              selectedPickupWindow.value === 'specific' ? null : selectedPickupWindow.days,
            preferredPickupDate:
              selectedPickupWindow.value === 'specific'
                ? preferredPickupDate
                : addDaysToDateInput(selectedPickupWindow.days),
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
  }, [
    pickupDetails.lat,
    pickupDetails.lng,
    selectedCity?.lat,
    selectedCity?.lng,
    weightKg,
    selectedCourier?.id,
    selectedCourier?.name,
    selectedPickupWindow.value,
    selectedPickupWindow.days,
    preferredPickupDate,
  ]);

  // Map Selection Confirmation
  const handleMapConfirm = (location) => {
    if (mapPickerTarget === 'pickup') {
      setPickupDetails((prev) => {
        const next = {
          ...prev,
          address: location.locality || prev.address || location.address || '',
          city: location.city || prev.city || '',
          state: location.state || prev.state || '',
          pincode: location.pincode || prev.pincode || '',
          lat: location.lat,
          lng: location.lng,
        };
        // If street line is empty, fall back to full formatted address from map
        if (!next.address?.trim() && location.address) {
          next.address = location.address;
        }
        next.fullAddress = composePickupFullAddress(next) || location.address || '';
        return next;
      });
      toast.success("Pickup location updated!");
    }
    setMapPickerTarget(null);
  };

  // Create Parcel request
  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    const composedAddress = composePickupFullAddress(pickupDetails);
    if (!pickupDetails.address?.trim()) {
      return toast.error("Please enter house / street address.");
    }
    if (!pickupDetails.city?.trim()) {
      return toast.error("Please enter city.");
    }
    if (!pickupDetails.state?.trim()) {
      return toast.error("Please enter state.");
    }
    if (!pickupDetails.pincode?.trim()) {
      return toast.error("Please enter pincode.");
    }
    if (!pickupDetails.lat || !pickupDetails.lng) {
      return toast.error("Please select pickup location on the map.");
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

    const dropAddress = (() => {
      const loc = selectedCourier?.location || {};
      const hasStoredLocation =
        loc.fullAddress?.trim() &&
        Number.isFinite(Number(loc.lat)) &&
        Number.isFinite(Number(loc.lng));

      if (hasStoredLocation) {
        return {
          name: selectedCourier.name,
          phone:
            String(loc.phone || pickupDetails.phone || "")
              .replace(/\D/g, "")
              .slice(-10) || "0000000000",
          fullAddress: loc.fullAddress.trim(),
          lat: Number(loc.lat),
          lng: Number(loc.lng),
        };
      }

      return {
        name: courierCompany,
        phone: String(pickupDetails.phone || "").replace(/\D/g, "").slice(-10) || "0000000000",
        fullAddress: `${courierCompany} drop point, ${destinationCity}`,
        lat: selectedCity.lat,
        lng: selectedCity.lng,
      };
    })();

    const resolvedPickupDate =
      selectedPickupWindow.value === 'specific'
        ? preferredPickupDate
        : addDaysToDateInput(selectedPickupWindow.days);

    setLoading(true);
    try {
      const response = await parcelApi.createParcel({
        pickupAddress: {
          name: pickupDetails.name,
          phone: pickupDetails.phone,
          fullAddress: composedAddress,
          lat: pickupDetails.lat,
          lng: pickupDetails.lng,
        },
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

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 font-outfit mt-4">
      {/* Header section */}
      <div className="bg-gradient-to-r from-primary to-blue-600 rounded-3xl p-6 md:p-8 text-white shadow-xl mb-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-white/85 hover:text-white font-bold text-xs mb-4 transition-all hover:-translate-x-1"
        >
          <ChevronLeft size={16} /> Back to Home
        </button>
        <span className="bg-white/20 text-xs font-extrabold uppercase px-3 py-1.5 rounded-full tracking-widest">
          Up to {maxWeightKg} KG Only
        </span>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-3 flex items-center gap-3">
          <Truck size={32} className="shrink-0" /> Instant Parcel Delivery
        </h1>
        <p className="text-white/80 font-medium text-sm md:text-base mt-2 max-w-lg">
          Send documents, keys, food, or electronics instantly across the city. Smooth, secure, and fully tracked.
        </p>
      </div>

      {/* Main Content Area */}
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

              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Full Pickup Address
                </p>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    House / Flat / Building / Street
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Flat No, Building name, Street / Area"
                    value={pickupDetails.address}
                    onChange={(e) => updatePickupField('address', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    Nearest Landmark <span className="normal-case font-medium text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Near City Mall, Opp. Temple"
                    value={pickupDetails.landmark}
                    onChange={(e) => updatePickupField('landmark', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">City</label>
                    <input
                      type="text"
                      required
                      placeholder="City"
                      value={pickupDetails.city}
                      onChange={(e) => updatePickupField('city', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">State</label>
                    <input
                      type="text"
                      required
                      placeholder="State"
                      value={pickupDetails.state}
                      onChange={(e) => updatePickupField('state', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Pincode</label>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="110075"
                    value={pickupDetails.pincode}
                    onChange={(e) =>
                      updatePickupField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
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
                  {['COD', 'UPI'].map((method) => (
                    <label
                      key={method}
                      className={`border-2 rounded-2xl p-3 flex items-center justify-between cursor-pointer transition-all hover:bg-slate-50 ${
                        paymentMethod === method ? 'border-primary bg-primary/5' : 'border-slate-100'
                      }`}
                    >
                      <div>
                        <span className="text-sm font-bold text-slate-800 uppercase">{method}</span>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {method === 'COD' ? 'Cash on pickup/drop' : 'Instant Online'}
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
                    <span>Weight Charge ({weightKg} kg)</span>
                    <span>₹{Number(fareEstimation.weightFare).toFixed(2)}</span>
                  </div>
                  {Number(fareEstimation.platformCharge) > 0 && (
                    <div className="flex justify-between">
                      <span>Platform Charge</span>
                      <span>₹{Number(fareEstimation.platformCharge).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(fareEstimation.billableDays) > 1 && (
                    <>
                      <div className="flex justify-between pt-1 border-t border-white/10">
                        <span>Daily rate</span>
                        <span>₹{Number(fareEstimation.dailyFare ?? fareEstimation.fare).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-white font-semibold">
                        <span>× {Number(fareEstimation.billableDays)} days</span>
                        <span>₹{Number(fareEstimation.fare).toFixed(2)}</span>
                      </div>
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
