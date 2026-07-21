import Parcel from "../models/parcel.js";
import ParcelConfig from "../models/parcelConfig.js";
import CourierCompany from "../models/courierCompany.js";
import Delivery from "../models/delivery.js";
import User from "../models/customer.js";
import Admin from "../models/admin.js";
import { distanceMeters } from "../utils/geoUtils.js";
import handleResponse from "../utils/helper.js";
import Notification from "../models/notification.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { emitToAdmins, emitToDelivery, emitToCustomer, retractParcelBroadcast } from "../services/orderSocketEmitter.js";
import {
  startParcelBroadcast,
  parcelAcceptAtomic,
  parcelRejectAtomic,
  fetchAvailableParcelsForRider,
  cancelParcelSearch,
  computeRiderParcelEarnings,
} from "../services/parcelWorkflowService.js";
import { resetAllParcelData } from "../services/parcelDataResetService.js";
import { sendSmsIndiaHubOtp } from "../services/smsIndiaHubService.js";
import { useRealSMS, generateParcelOtp } from "../utils/otp.js";
import { getCachedRoute } from "../services/mapsRouteService.js";
import {
  resolveParcelBillableDays,
  applyBillableDaysToFare,
} from "../utils/parcelFare.js";

/**
 * Send delivery verification OTP to the dropoff receiver phone.
 * Uses real SMS when configured; otherwise logs mock OTP for local testing.
 */
async function dispatchParcelDeliveryOtpToReceiver(parcel) {
  const digits = String(parcel?.dropAddress?.phone || "").replace(/\D/g, "");
  const otp = String(parcel?.otp || "").trim();
  if (!otp || digits.length < 10) {
    console.warn("[parcel] skip receiver OTP — missing phone or otp", {
      parcelId: parcel?._id,
      phoneLen: digits.length,
    });
    return { sent: false };
  }

  const phone = digits.slice(-10);
  const receiverName = parcel?.dropAddress?.name || "Customer";
  const message =
    `Hi ${receiverName}, your SunGguard parcel delivery OTP is ${otp}. ` +
    `Share this OTP only with the delivery captain to receive your parcel.`;

  try {
    if (useRealSMS()) {
      await sendSmsIndiaHubOtp({ phone, otp, message });
    } else {
      console.log(`[ParcelDeliveryOTP][mock] receiver ${phone} -> ${otp}`);
    }
    return { sent: true, phone };
  } catch (error) {
    console.error("[parcel] receiver OTP SMS failed:", error?.message || error);
    return { sent: false, error: error?.message };
  }
}

// Utility to send notifications
async function sendParcelNotification(userId, role, title, body, eventType = "alert", parcelId = null) {
  try {
    if (Object.values(NOTIFICATION_EVENTS).includes(eventType)) {
      emitNotificationEvent(eventType, {
        userId,
        customerId: role === "customer" ? userId : undefined,
        deliveryId: role === "delivery" ? userId : undefined,
        parcelId,
        body,
        data: {
          title,
          parcelId,
          role,
        }
      });
    } else {
      await Notification.create({
        userId,
        recipient: userId,
        role: role === "customer" ? "customer" : role === "delivery" ? "delivery" : role,
        recipientModel: role === "customer" ? "Customer" : role === "delivery" ? "Delivery" : role === "admin" ? "Admin" : "Seller",
        title,
        body,
        message: body,
        status: "pending",
        type: "alert",
      });
    }
  } catch (err) {
    console.error("Failed to send notification:", err);
  }
}

/* ==========================================================================
   CUSTOMER CONTROLLERS
   ========================================================================== */

export const calculateFare = async (req, res) => {
  try {
    const {
      pickupLat,
      pickupLng,
      dropLat,
      dropLng,
      weight,
      courierCompany,
      courierCompanyId,
      pickupWindow,
      pickupWindowDays,
      preferredPickupDate,
    } = req.body;

    if (!pickupLat || !pickupLng || !dropLat || !dropLng) {
      return handleResponse(res, 400, "Pickup and drop locations are required");
    }

    const config = await ParcelConfig.getOrCreate();
    const maxWeightKg = Math.min(50, Math.max(0.1, Number(config.maxWeightKg) || 1));
    const pkgWeight = Number(weight || 0.1);
    if (pkgWeight <= 0 || pkgWeight > maxWeightKg) {
      return handleResponse(
        res,
        400,
        `Weight must be greater than 0 and maximum ${maxWeightKg} KG`,
      );
    }

    const distanceM = distanceMeters(
      Number(pickupLat),
      Number(pickupLng),
      Number(dropLat),
      Number(dropLng)
    );
    const distanceKm = Math.round((distanceM / 1000 + Number.EPSILON) * 100) / 100;
    const baseFare = Math.round((Number(config.baseFare) || 0) * 100) / 100;
    const weightCharge = Number(config.weightCharge) || 0;

    // Distance fare and courier company fee are not charged to the customer.
    const distanceFare = 0;
    const weightFare =
      Math.round((pkgWeight * weightCharge + Number.EPSILON) * 100) / 100;

    let platformCharge = 0;
    const courierKey = courierCompanyId || courierCompany;
    if (courierKey) {
      const courier = await CourierCompany.findActiveByNameOrId(courierKey);
      if (courier) {
        platformCharge = Math.round((Number(courier.platformCharge) || 0) * 100) / 100;
      }
    }
    const companyCharge = 0;
    const courierCharge = platformCharge;

    const dailyFare =
      Math.round((baseFare + weightFare + platformCharge + Number.EPSILON) * 100) / 100;

    const billableDays = resolveParcelBillableDays({
      pickupWindow,
      pickupWindowDays,
      preferredPickupDate,
    });
    const priced = applyBillableDaysToFare(
      {
        baseFare,
        distanceFare,
        weightFare,
        platformCharge,
        companyCharge,
        courierCharge,
        fare: dailyFare,
      },
      billableDays,
    );

    return handleResponse(res, 200, "Fare calculated successfully", {
      distance: distanceKm,
      baseFare: priced.baseFare,
      distanceFare: priced.distanceFare,
      weightFare: priced.weightFare,
      platformCharge: priced.platformCharge,
      companyCharge: priced.companyCharge,
      courierCharge: priced.courierCharge,
      dailyFare: priced.dailyFare,
      billableDays: priced.billableDays,
      fare: priced.fare,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const createParcel = async (req, res) => {
  try {
    const {
      pickupAddress,
      dropAddress,
      packageDetails,
      paymentMethod,
      courierCompany,
      courierCompanyId,
      destinationCity,
      preferredPickupDate,
      pickupWindow,
      pickupWindowDays,
    } = req.body;

    if (!pickupAddress || !dropAddress || !packageDetails || !paymentMethod) {
      return handleResponse(res, 400, "Missing required details");
    }

    const courierKey = courierCompanyId || courierCompany;
    const courierDoc = await CourierCompany.findActiveByNameOrId(courierKey);
    if (!courierDoc) {
      return handleResponse(res, 400, "Please select a valid courier company");
    }
    const courier = courierDoc.name;
    const city = String(destinationCity || "").trim();
    if (!city) {
      return handleResponse(res, 400, "Please select destination city");
    }

    const allowedWindows = ["today", "7_days", "15_days", "30_days", "specific"];
    const windowValue = allowedWindows.includes(String(pickupWindow || "").trim())
      ? String(pickupWindow).trim()
      : "specific";

    const windowDaysMap = {
      today: 0,
      "7_days": 7,
      "15_days": 15,
      "30_days": 30,
      specific: null,
    };

    let resolvedWindowDays =
      windowValue === "specific"
        ? pickupWindowDays == null || pickupWindowDays === ""
          ? null
          : Number(pickupWindowDays)
        : windowDaysMap[windowValue];

    if (windowValue !== "specific" && !Number.isFinite(resolvedWindowDays)) {
      resolvedWindowDays = windowDaysMap[windowValue] ?? 0;
    }

    if (!preferredPickupDate && windowValue === "specific") {
      return handleResponse(res, 400, "Please select preferred pickup date");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let pickupDate;
    if (windowValue === "specific") {
      pickupDate = new Date(preferredPickupDate);
    } else {
      pickupDate = preferredPickupDate
        ? new Date(preferredPickupDate)
        : new Date(today.getTime() + resolvedWindowDays * 24 * 60 * 60 * 1000);
    }

    if (Number.isNaN(pickupDate.getTime())) {
      return handleResponse(res, 400, "Invalid preferred pickup date");
    }
    const pickupDay = new Date(pickupDate);
    pickupDay.setHours(0, 0, 0, 0);
    if (pickupDay < today) {
      return handleResponse(res, 400, "Preferred pickup date cannot be in the past");
    }
    const maxDay = new Date(today);
    maxDay.setDate(maxDay.getDate() + 30);
    if (pickupDay > maxDay) {
      return handleResponse(res, 400, "Preferred pickup date cannot be more than 30 days ahead");
    }

    const config = await ParcelConfig.getOrCreate();
    const maxWeightKg = Math.min(50, Math.max(0.1, Number(config.maxWeightKg) || 1));
    const weight = Number(packageDetails.weight || 0);
    if (weight <= 0 || weight > maxWeightKg) {
      return handleResponse(
        res,
        400,
        `Weight must be greater than 0 and maximum ${maxWeightKg} KG`,
      );
    }

    const allowedTypes = (config.packageTypes || [])
      .filter((t) => t?.isActive !== false)
      .map((t) => String(t.value));
    const packageType = String(packageDetails.packageType || "").trim();
    if (!packageType || (allowedTypes.length && !allowedTypes.includes(packageType))) {
      return handleResponse(res, 400, "Invalid package type");
    }

    const distanceM = distanceMeters(
      Number(pickupAddress.lat),
      Number(pickupAddress.lng),
      Number(dropAddress.lat),
      Number(dropAddress.lng)
    );
    const distanceKm = Math.round((distanceM / 1000 + Number.EPSILON) * 100) / 100;
    const baseFare = Math.round((Number(config.baseFare) || 0) * 100) / 100;
    // Distance fare and courier company fee are not charged to the customer.
    const distanceFare = 0;
    const weightFare =
      Math.round((weight * (Number(config.weightCharge) || 0) + Number.EPSILON) * 100) / 100;
    const platformCharge =
      Math.round((Number(courierDoc.platformCharge) || 0) * 100) / 100;
    const companyCharge = 0;
    const courierCharge = platformCharge;
    const dailyFare =
      Math.round((baseFare + weightFare + platformCharge + Number.EPSILON) * 100) / 100;

    const billableDays = resolveParcelBillableDays({
      pickupWindow: windowValue,
      pickupWindowDays: resolvedWindowDays,
      preferredPickupDate: pickupDay,
    });
    const priced = applyBillableDaysToFare(
      {
        baseFare,
        distanceFare,
        weightFare,
        platformCharge,
        companyCharge,
        courierCharge,
        fare: dailyFare,
      },
      billableDays,
    );

    // Generate 6-digit OTP code
    const otp = generateParcelOtp();

    const parcel = await Parcel.create({
      customerId: req.user.id,
      pickupAddress,
      dropAddress,
      packageDetails,
      courierCompany: courier,
      courierCompanyId: courierDoc._id,
      destinationCity: city,
      preferredPickupDate: pickupDate,
      pickupWindow: windowValue,
      pickupWindowDays: resolvedWindowDays,
      weight,
      distance: distanceKm,
      fare: priced.fare,
      fareBreakdown: {
        baseFare: priced.baseFare,
        distanceFare: priced.distanceFare,
        weightFare: priced.weightFare,
        platformCharge: priced.platformCharge,
        companyCharge: priced.companyCharge,
        courierCharge: priced.courierCharge,
        dailyFare: priced.dailyFare,
        billableDays: priced.billableDays,
      },
      paymentStatus: paymentMethod === "COD" ? "PENDING" : "PAID", // Card/UPI/Wallet paid immediately
      paymentMethod,
      otp,
      status: "REQUESTED",
    });

    // Notify admins via socket (live modal on admin dashboard)
    emitToAdmins("parcel:new", parcel);

    // Broadcast to nearby parcel riders (first accept wins)
    const searchingParcel = await startParcelBroadcast(parcel);
    const resultParcel = searchingParcel || parcel;

    // In-app + push: customer confirmation and admin inbox (so admin can open request)
    try {
      const admins = await Admin.find().select("_id").lean();
      const adminIds = (admins || []).map((a) => a?._id).filter(Boolean);
      emitNotificationEvent(NOTIFICATION_EVENTS.PARCEL_REQUESTED, {
        userId: req.user.id,
        customerId: req.user.id,
        adminIds,
        parcelId: parcel._id,
        fare: parcel.fare,
        customerBody: `Your parcel delivery request (ID: ${parcel._id}) has been created. Searching for a nearby rider...`,
        adminBody: `Parcel #${String(parcel._id).slice(-6)} booked for ₹${parcel.fare}. Open Parcel Delivery to view.`,
        data: {
          parcelId: parcel._id,
          fare: parcel.fare,
          pickup: parcel.pickupAddress?.fullAddress,
          drop: parcel.dropAddress?.fullAddress,
        },
      });
    } catch (notifyErr) {
      console.error("Failed to notify customer/admins for parcel request:", notifyErr);
    }

    return handleResponse(res, 201, "Parcel request created successfully", resultParcel);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getParcelHistory = async (req, res) => {
  try {
    const parcels = await Parcel.find({ customerId: req.user.id })
      .populate("deliveryPartnerId", "name phone vehicleType")
      .sort({ createdAt: -1 });

    return handleResponse(res, 200, "Parcel history retrieved successfully", parcels);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const trackParcel = async (req, res) => {
  try {
    const parcel = await Parcel.findById(req.params.id)
      .populate("customerId", "name phone email")
      .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber profileImage location");

    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    return handleResponse(res, 200, "Parcel details retrieved successfully", parcel);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const cancelParcelByCustomer = async (req, res) => {
  try {
    const { parcelId } = req.params;
    if (!parcelId) {
      return handleResponse(res, 400, "Parcel ID is required");
    }

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    if (String(parcel.customerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this parcel");
    }

    if (!["REQUESTED", "SEARCHING"].includes(parcel.status)) {
      return handleResponse(
        res,
        409,
        "Parcel search can only be cancelled while searching for rider",
      );
    }

    if (parcel.status === "SEARCHING") {
      cancelParcelSearch(parcel._id);
      await retractParcelBroadcast(String(parcel._id), null);
    }

    parcel.status = "CANCELLED";
    parcel.searchExpiresAt = null;
    parcel.searchMeta = undefined;
    await parcel.save();

    emitToAdmins("parcel:status:update", parcel);
    emitToCustomer(parcel.customerId, {
      event: "parcel:status:update",
      payload: {
        parcelId: String(parcel._id),
        status: parcel.status,
        parcel,
      },
    });

    return handleResponse(res, 200, "Parcel search cancelled successfully", parcel);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ==========================================================================
   ADMIN CONTROLLERS
   ========================================================================== */

export const adminGetParcels = async (req, res) => {
  try {
    const parcels = await Parcel.find()
      .populate("customerId", "name phone email")
      .populate("deliveryPartnerId", "name phone vehicleType")
      .sort({ createdAt: -1 });

    return handleResponse(res, 200, "Parcels retrieved successfully", parcels);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminAssignRider = async (req, res) => {
  try {
    const { parcelId, riderId } = req.body;

    if (!parcelId || !riderId) {
      return handleResponse(res, 400, "Parcel ID and Rider ID are required");
    }

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    if (parcel.deliveryPartnerId) {
      return handleResponse(res, 409, "Parcel already has a rider assigned");
    }

    if (parcel.status === "SEARCHING") {
      cancelParcelSearch(parcelId);
      await retractParcelBroadcast(String(parcelId), null);
    }

    const rider = await Delivery.findById(riderId);
    if (!rider) {
      return handleResponse(res, 404, "Delivery partner not found");
    }

    parcel.deliveryPartnerId = riderId;
    parcel.status = "ACCEPTED";
    parcel.acceptedAt = new Date();
    parcel.searchExpiresAt = null;
    parcel.searchMeta = undefined;
    await parcel.save();

    rider.isBusy = true;
    await rider.save();
    // Emit socket event to the rider in real-time
    emitToDelivery(riderId, {
      event: "parcel:assigned",
      payload: parcel
    });

    emitToAdmins("parcel:status:update", parcel);

    // Notify Customer
    await sendParcelNotification(
      parcel.customerId,
      "customer",
      "Rider Assigned",
      `Delivery partner ${rider.name} (${rider.phone}) has been assigned to your parcel.`,
      NOTIFICATION_EVENTS.PARCEL_STATUS_UPDATE,
      parcel._id
    );

    // Notify Rider
    await sendParcelNotification(
      riderId,
      "delivery",
      "New Parcel Delivery Assigned",
      `You have been assigned a new parcel delivery from ${parcel.pickupAddress.fullAddress} to ${parcel.dropAddress.fullAddress}.`,
      NOTIFICATION_EVENTS.PARCEL_ASSIGNED,
      parcel._id
    );

    emitToCustomer(parcel.customerId, {
      event: "parcel:status:update",
      payload: {
        parcelId: String(parcel._id),
        status: "ACCEPTED",
        parcel,
      },
    });

    return handleResponse(res, 200, "Delivery partner assigned successfully", parcel);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminGetPricingConfig = async (req, res) => {
  try {
    const config = await ParcelConfig.getOrCreate();
    return handleResponse(res, 200, "Pricing config retrieved successfully", config);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** Public booking options for customer Package Details form. */
export const getBookingConfig = async (req, res) => {
  try {
    const config = await ParcelConfig.getPublicBookingConfig();
    const courierCompanies = await CourierCompany.listActiveForBooking();
    return handleResponse(res, 200, "Parcel booking config retrieved", {
      ...config,
      courierCompanies: (courierCompanies || []).map((c) => ({
        id: String(c._id),
        name: c.name,
        platformCharge: Math.round((Number(c.platformCharge) || 0) * 100) / 100,
        companyCharge: Math.round((Number(c.companyCharge) || 0) * 100) / 100,
        location: c.location || null,
      })),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminUpdatePricingConfig = async (req, res) => {
  try {
    const {
      baseFare,
      perKmCharge,
      weightCharge,
      baseSearchRadiusKm,
      radiusMultiplier,
      riderSharePercent,
      riderBaseFareSharePercent,
      riderDistanceFareSharePercent,
      packageTypes,
      maxWeightKg,
      packageDescriptionPlaceholder,
    } = req.body;

    const config = await ParcelConfig.getOrCreate();
    if (baseFare !== undefined) config.baseFare = Number(baseFare);
    if (perKmCharge !== undefined) config.perKmCharge = Number(perKmCharge);
    if (weightCharge !== undefined) config.weightCharge = Number(weightCharge);
    if (baseSearchRadiusKm !== undefined) {
      config.baseSearchRadiusKm = Math.min(100, Math.max(1, Number(baseSearchRadiusKm)));
    }
    if (radiusMultiplier !== undefined) {
      config.radiusMultiplier = Math.min(5, Math.max(1, Number(radiusMultiplier)));
    }
    if (riderBaseFareSharePercent !== undefined) {
      config.riderBaseFareSharePercent = Math.min(
        100,
        Math.max(0, Number(riderBaseFareSharePercent)),
      );
    }
    if (riderDistanceFareSharePercent !== undefined) {
      config.riderDistanceFareSharePercent = Math.min(
        100,
        Math.max(0, Number(riderDistanceFareSharePercent)),
      );
    }
    // Keep legacy field in sync as average for older readers.
    if (
      riderBaseFareSharePercent !== undefined ||
      riderDistanceFareSharePercent !== undefined
    ) {
      const basePct = Number(
        config.riderBaseFareSharePercent ?? config.riderSharePercent ?? 80,
      );
      const distPct = Number(
        config.riderDistanceFareSharePercent ?? config.riderSharePercent ?? 80,
      );
      config.riderSharePercent = Math.round((basePct + distPct) / 2);
    } else if (riderSharePercent !== undefined) {
      const pct = Math.min(100, Math.max(0, Number(riderSharePercent)));
      config.riderSharePercent = pct;
      config.riderBaseFareSharePercent = pct;
      config.riderDistanceFareSharePercent = pct;
    }
    if (packageTypes !== undefined) {
      config.packageTypes = ParcelConfig.normalizePackageTypes(packageTypes);
    }
    if (maxWeightKg !== undefined) {
      config.maxWeightKg = Math.min(50, Math.max(0.1, Number(maxWeightKg) || 1));
    }
    if (packageDescriptionPlaceholder !== undefined) {
      config.packageDescriptionPlaceholder = String(
        packageDescriptionPlaceholder || "",
      ).trim() || "E.g. keys, critical document papers...";
    }

    await config.save();
    return handleResponse(res, 200, "Pricing config updated successfully", config);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminGetReports = async (req, res) => {
  try {
    const parcels = await Parcel.find();
    
    const totalDeliveries = parcels.length;
    const completed = parcels.filter(p => p.status === "DELIVERED").length;
    const cancelled = parcels.filter(p => p.status === "CANCELLED").length;
    
    // Revenue is calculated from DELIVERED parcels or PAID paymentStatus
    const revenue = parcels
      .filter(p => p.status === "DELIVERED")
      .reduce((sum, p) => sum + p.fare, 0);

    const settings = await ParcelConfig.getSearchSettings();
    const delivered = parcels.filter((p) => p.status === "DELIVERED");
    const riderPayout = Math.round(
      (delivered.reduce(
        (sum, p) => sum + computeRiderParcelEarnings(p, settings),
        0,
      ) +
        Number.EPSILON) *
        100,
    ) / 100;
    const adminCommission = Math.round(
      (revenue - riderPayout + Number.EPSILON) * 100,
    ) / 100;

    return handleResponse(res, 200, "Reports retrieved successfully", {
      totalDeliveries,
      completed,
      cancelled,
      revenue,
      riderSharePercent: settings.riderSharePercent,
      riderBaseFareSharePercent: settings.riderBaseFareSharePercent,
      riderDistanceFareSharePercent: settings.riderDistanceFareSharePercent,
      riderPayout,
      adminCommission,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminGetActiveDeliveries = async (req, res) => {
  try {
    const activeParcels = await Parcel.find({
      status: { $in: ["SEARCHING", "REQUESTED", "ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED", "PICKED_UP", "OUT_FOR_DELIVERY"] }
    })
      .populate("customerId", "name phone")
      .populate("deliveryPartnerId", "name phone");

    return handleResponse(res, 200, "Active deliveries retrieved successfully", activeParcels);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminResetAllParcelData = async (req, res) => {
  try {
    const confirm = String(req.body?.confirm || "").trim();
    if (confirm !== "RESET_PARCEL") {
      return handleResponse(
        res,
        400,
        'Send { "confirm": "RESET_PARCEL" } to wipe all parcel data.',
      );
    }

    const summary = await resetAllParcelData();
    return handleResponse(res, 200, "All parcel data cleared successfully", summary);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminGetRiders = async (req, res) => {
  try {
    const riders = await Delivery.find({ isVerified: true });
    
    // Sort riders:
    // 1. Available (online, free, parcel-ready) first
    // 2. Others next
    const sortedRiders = [...riders].sort((a, b) => {
      const aAvailable = a.isOnline && !a.isBusy && a.isParcelService;
      const bAvailable = b.isOnline && !b.isBusy && b.isParcelService;
      if (aAvailable && !bAvailable) return -1;
      if (!aAvailable && bAvailable) return 1;
      return 0;
    });

    return handleResponse(res, 200, "Verified riders retrieved successfully", sortedRiders);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ==========================================================================
   DELIVERY PARTNER CONTROLLERS
   ========================================================================== */

export const riderGetAssignedParcels = async (req, res) => {
  try {
    // Return both assigned but not yet accepted or currently in-progress parcels
    const parcels = await Parcel.find({
      deliveryPartnerId: req.user.id,
      status: { $ne: "DELIVERED" }
    })
      .populate("customerId", "name phone")
      .sort({ createdAt: -1 });

    return handleResponse(res, 200, "Assigned parcels retrieved successfully", parcels);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/**
 * Road route for assigned parcel task map.
 * Query: phase=pickup|drop|full, originLat, originLng (rider position).
 */
export const getParcelRoute = async (req, res) => {
  try {
    const { parcelId } = req.params;
    const phase = String(req.query.phase || "pickup").toLowerCase();
    const originLat = parseFloat(req.query.originLat);
    const originLng = parseFloat(req.query.originLng);

    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      return handleResponse(res, 400, "originLat and originLng required");
    }

    const parcel = await Parcel.findById(parcelId).lean();
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this parcel");
    }

    const pickup = {
      lat: Number(parcel.pickupAddress?.lat),
      lng: Number(parcel.pickupAddress?.lng),
    };
    const drop = {
      lat: Number(parcel.dropAddress?.lat),
      lng: Number(parcel.dropAddress?.lng),
    };

    if (!Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) {
      return handleResponse(res, 400, "Pickup location missing");
    }
    if (!Number.isFinite(drop.lat) || !Number.isFinite(drop.lng)) {
      return handleResponse(res, 400, "Drop location missing");
    }

    const origin = { lat: originLat, lng: originLng };
    const dest = phase === "drop" || phase === "full" ? drop : pickup;

    const route = await getCachedRoute(origin, dest, "driving", null, phase);
    return handleResponse(res, 200, "Route", { ...route, destination: dest });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const riderUpdateStatus = async (req, res) => {
  try {
    const { parcelId, status, pickupProofImage } = req.body;

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this parcel");
    }

    const validTransitions = ["ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED", "PICKED_UP", "OUT_FOR_DELIVERY", "CANCELLED"];
    if (!validTransitions.includes(status)) {
      return handleResponse(res, 400, "Invalid status transition");
    }

    parcel.status = status;
    if (status === "PICKED_UP" && pickupProofImage) {
      parcel.pickupProofImage = pickupProofImage;
    }

    // Fresh OTP at delivery time — sent to dropoff receiver phone.
    // Uses 123456 until USE_REAL_SMS=true.
    let receiverOtpDispatch = null;
    if (status === "OUT_FOR_DELIVERY") {
      parcel.otp = generateParcelOtp();
    }

    await parcel.save();

    if (status === "OUT_FOR_DELIVERY") {
      receiverOtpDispatch = await dispatchParcelDeliveryOtpToReceiver(parcel);
    }

    const populated = await Parcel.findById(parcel._id)
      .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber profileImage location");

    emitToAdmins("parcel:status:update", populated || parcel);
    emitToCustomer(parcel.customerId, {
      event: "parcel:status:update",
      payload: {
        parcelId: String(parcel._id),
        status,
        parcel: populated || parcel,
        otp: status === "OUT_FOR_DELIVERY" ? parcel.otp : undefined,
        otpSentToReceiver: receiverOtpDispatch?.sent === true,
      },
    });

    if (status === "CANCELLED") {
      const rider = await Delivery.findById(req.user.id);
      if (rider) {
        rider.isBusy = false;
        await rider.save();
      }
    }

    // Map status to customer-friendly notification descriptions
    let msg = "";
    if (status === "ACCEPTED") msg = "Your parcel delivery request has been accepted by the rider.";
    else if (status === "RIDER_ASSIGNED") msg = "Rider is on the way to pick up your parcel.";
    else if (status === "PICKUP_REACHED") msg = "Rider has reached your pickup location.";
    else if (status === "PICKED_UP") msg = "Rider has picked up your parcel.";
    else if (status === "OUT_FOR_DELIVERY") {
      msg = receiverOtpDispatch?.sent
        ? `Your parcel is out for delivery. Delivery OTP ${parcel.otp} has been sent to receiver ${parcel.dropAddress?.phone}.`
        : `Your parcel is out for delivery. Delivery OTP is ${parcel.otp}. Share it with the receiver if needed.`;
    }
    else if (status === "CANCELLED") msg = "Your parcel delivery was cancelled by the rider.";

    await sendParcelNotification(
      parcel.customerId,
      "customer",
      status === "OUT_FOR_DELIVERY" ? "Parcel OTP sent to receiver" : `Parcel status: ${status}`,
      msg,
      NOTIFICATION_EVENTS.PARCEL_STATUS_UPDATE,
      parcel._id
    );

    const resultDoc = populated || parcel;
    const resultPayload = resultDoc.toObject ? resultDoc.toObject() : { ...resultDoc };
    if (status === "OUT_FOR_DELIVERY") {
      resultPayload.otpSentToReceiver = receiverOtpDispatch?.sent === true;
    }

    return handleResponse(res, 200, "Parcel status updated successfully", resultPayload);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const riderCompleteDelivery = async (req, res) => {
  try {
    const { parcelId, otp, deliveryProofImage } = req.body;

    if (!parcelId || !otp) {
      return handleResponse(res, 400, "Parcel ID and OTP are required");
    }

    const parcel = await Parcel.findById(parcelId);
    if (!parcel) {
      return handleResponse(res, 404, "Parcel not found");
    }

    if (String(parcel.deliveryPartnerId) !== String(req.user.id)) {
      return handleResponse(res, 403, "You are not authorized for this parcel");
    }

    if (parcel.otp !== String(otp).trim()) {
      return handleResponse(res, 400, "Invalid delivery verification OTP");
    }

    parcel.status = "DELIVERED";
    parcel.paymentStatus = "PAID";
    if (deliveryProofImage) {
      parcel.deliveryProofImage = deliveryProofImage;
    }

    await parcel.save();

    const populated = await Parcel.findById(parcel._id)
      .populate("deliveryPartnerId", "name phone vehicleType vehicleNumber profileImage location");

    emitToAdmins("parcel:status:update", populated || parcel);
    emitToCustomer(parcel.customerId, {
      event: "parcel:status:update",
      payload: {
        parcelId: String(parcel._id),
        status: "DELIVERED",
        parcel: populated || parcel,
      },
    });

    const rider = await Delivery.findById(req.user.id);
    if (rider) {
      rider.isBusy = false;
      await rider.save();
    }

    // Notify customer
    await sendParcelNotification(
      parcel.customerId,
      "customer",
      "Parcel Delivered",
      `Your parcel has been delivered successfully. Thank you for using our service!`,
      NOTIFICATION_EVENTS.PARCEL_DELIVERED,
      parcel._id
    );

    return handleResponse(res, 200, "Parcel delivered successfully", parcel);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const riderGetEarnings = async (req, res) => {
  try {
    const completedParcels = await Parcel.find({
      deliveryPartnerId: req.user.id,
      status: "DELIVERED"
    });
    const settings = await ParcelConfig.getSearchSettings();

    const totalDeliveries = completedParcels.length;
    const totalEarnings = completedParcels.reduce(
      (sum, p) => sum + computeRiderParcelEarnings(p, settings),
      0,
    );
    const roundedEarnings = Math.round((totalEarnings + Number.EPSILON) * 100) / 100;

    return handleResponse(res, 200, "Rider earnings retrieved successfully", {
      totalDeliveries,
      totalEarnings: roundedEarnings,
      riderBaseFareSharePercent: settings.riderBaseFareSharePercent,
      riderDistanceFareSharePercent: settings.riderDistanceFareSharePercent,
      deliveries: completedParcels,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const riderGetAvailableParcels = async (req, res) => {
  try {
    const parcels = await fetchAvailableParcelsForRider(req.user.id);
    const settings = await ParcelConfig.getSearchSettings();
    const withEarnings = parcels.map((parcel) => ({
      ...parcel,
      riderBaseFareSharePercent: settings.riderBaseFareSharePercent,
      riderDistanceFareSharePercent: settings.riderDistanceFareSharePercent,
      earnings: computeRiderParcelEarnings(parcel, settings),
    }));
    return handleResponse(
      res,
      200,
      withEarnings.length ? "Available parcels fetched" : "No parcels found",
      withEarnings,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const riderAcceptParcel = async (req, res) => {
  try {
    const { parcelId } = req.params;
    const idempotencyKey = req.headers["idempotency-key"] || req.body?.idempotencyKey;

    if (!parcelId) {
      return handleResponse(res, 400, "Parcel ID is required");
    }

    const { parcel, duplicate } = await parcelAcceptAtomic(
      req.user.id,
      parcelId,
      idempotencyKey,
    );

    return handleResponse(
      res,
      200,
      duplicate ? "Parcel already accepted" : "Parcel accepted successfully",
      parcel,
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const riderRejectParcel = async (req, res) => {
  try {
    const { parcelId } = req.params;
    if (!parcelId) {
      return handleResponse(res, 400, "Parcel ID is required");
    }

    await parcelRejectAtomic(req.user.id, parcelId);
    return handleResponse(res, 200, "Parcel offer skipped");
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
