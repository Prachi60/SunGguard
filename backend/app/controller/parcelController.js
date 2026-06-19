import Parcel from "../models/parcel.js";
import ParcelConfig from "../models/parcelConfig.js";
import Delivery from "../models/delivery.js";
import User from "../models/customer.js";
import { distanceMeters } from "../utils/geoUtils.js";
import handleResponse from "../utils/helper.js";
import Notification from "../models/notification.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { emitToAdmins, emitToDelivery } from "../services/orderSocketEmitter.js";

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
    const { pickupLat, pickupLng, dropLat, dropLng, weight } = req.body;

    if (!pickupLat || !pickupLng || !dropLat || !dropLng) {
      return handleResponse(res, 400, "Pickup and drop locations are required");
    }

    const pkgWeight = Number(weight || 0.1);
    if (pkgWeight <= 0 || pkgWeight > 1.0) {
      return handleResponse(res, 400, "Weight must be greater than 0 and maximum 1 KG");
    }

    const distanceM = distanceMeters(
      Number(pickupLat),
      Number(pickupLng),
      Number(dropLat),
      Number(dropLng)
    );
    const distanceKm = Math.round((distanceM / 1000 + Number.EPSILON) * 100) / 100;

    const config = await ParcelConfig.getOrCreate();
    const baseFare = config.baseFare;
    const perKmCharge = config.perKmCharge;
    const weightCharge = config.weightCharge;

    const distanceFare = distanceKm * perKmCharge;
    const weightFare = pkgWeight * weightCharge;
    const totalFare = baseFare + distanceFare + weightFare;
    const fare = Math.round((totalFare + Number.EPSILON) * 100) / 100;

    return handleResponse(res, 200, "Fare calculated successfully", {
      distance: distanceKm,
      baseFare,
      distanceFare,
      weightFare,
      fare,
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
    } = req.body;

    if (!pickupAddress || !dropAddress || !packageDetails || !paymentMethod) {
      return handleResponse(res, 400, "Missing required details");
    }

    const weight = Number(packageDetails.weight || 0);
    if (weight <= 0 || weight > 1.0) {
      return handleResponse(res, 400, "Weight must be greater than 0 and maximum 1 KG");
    }

    const distanceM = distanceMeters(
      Number(pickupAddress.lat),
      Number(pickupAddress.lng),
      Number(dropAddress.lat),
      Number(dropAddress.lng)
    );
    const distanceKm = Math.round((distanceM / 1000 + Number.EPSILON) * 100) / 100;

    const config = await ParcelConfig.getOrCreate();
    const distanceFare = distanceKm * config.perKmCharge;
    const weightFare = weight * config.weightCharge;
    const totalFare = config.baseFare + distanceFare + weightFare;
    const fare = Math.round((totalFare + Number.EPSILON) * 100) / 100;

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const parcel = await Parcel.create({
      customerId: req.user.id,
      pickupAddress,
      dropAddress,
      packageDetails,
      weight,
      distance: distanceKm,
      fare,
      paymentStatus: paymentMethod === "COD" ? "PENDING" : "PAID", // Card/UPI/Wallet paid immediately
      paymentMethod,
      otp,
      status: "REQUESTED",
    });

    // Notify admins via socket
    emitToAdmins("parcel:new", parcel);

    // Send notifications
    await sendParcelNotification(
      req.user.id,
      "customer",
      "Parcel Request Created",
      `Your parcel delivery request (ID: ${parcel._id}) has been created successfully. Fare: ₹${fare}`,
      NOTIFICATION_EVENTS.PARCEL_REQUESTED,
      parcel._id
    );

    return handleResponse(res, 201, "Parcel request created successfully", parcel);
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

    const rider = await Delivery.findById(riderId);
    if (!rider) {
      return handleResponse(res, 404, "Delivery partner not found");
    }

    parcel.deliveryPartnerId = riderId;
    parcel.status = "ACCEPTED";
    await parcel.save();

    rider.isBusy = true;
    await rider.save();
    // Emit socket event to the rider in real-time
    emitToDelivery(riderId, {
      event: "parcel:assigned",
      payload: parcel
    });

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

export const adminUpdatePricingConfig = async (req, res) => {
  try {
    const { baseFare, perKmCharge, weightCharge } = req.body;

    const config = await ParcelConfig.getOrCreate();
    if (baseFare !== undefined) config.baseFare = baseFare;
    if (perKmCharge !== undefined) config.perKmCharge = perKmCharge;
    if (weightCharge !== undefined) config.weightCharge = weightCharge;

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

    return handleResponse(res, 200, "Reports retrieved successfully", {
      totalDeliveries,
      completed,
      cancelled,
      revenue,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminGetActiveDeliveries = async (req, res) => {
  try {
    const activeParcels = await Parcel.find({
      status: { $in: ["ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED", "PICKED_UP", "OUT_FOR_DELIVERY"] }
    })
      .populate("customerId", "name phone")
      .populate("deliveryPartnerId", "name phone");

    return handleResponse(res, 200, "Active deliveries retrieved successfully", activeParcels);
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

    await parcel.save();

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
    else if (status === "OUT_FOR_DELIVERY") msg = "Your parcel is out for delivery.";
    else if (status === "CANCELLED") msg = "Your parcel delivery was cancelled by the rider.";

    await sendParcelNotification(
      parcel.customerId,
      "customer",
      `Parcel status: ${status}`,
      msg,
      NOTIFICATION_EVENTS.PARCEL_STATUS_UPDATE,
      parcel._id
    );

    return handleResponse(res, 200, "Parcel status updated successfully", parcel);
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

    const totalDeliveries = completedParcels.length;
    // Rider receives 80% of fare as earnings
    const totalEarnings = completedParcels.reduce((sum, p) => sum + (p.fare * 0.8), 0);
    const roundedEarnings = Math.round((totalEarnings + Number.EPSILON) * 100) / 100;

    return handleResponse(res, 200, "Rider earnings retrieved successfully", {
      totalDeliveries,
      totalEarnings: roundedEarnings,
      deliveries: completedParcels,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
