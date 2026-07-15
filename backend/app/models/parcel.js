import mongoose from "mongoose";

const addressDetailsSchema = new mongoose.Schema({
  fullAddress: {
    type: String,
    required: true,
  },
  lat: {
    type: Number,
    required: true,
  },
  lng: {
    type: Number,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
}, { _id: false });

const packageDetailsSchema = new mongoose.Schema({
  packageType: {
    type: String,
    required: true,
    trim: true,
  },
  weight: {
    type: Number,
    required: true,
    max: 50,
  },
  description: {
    type: String,
    trim: true,
  },
}, { _id: false });

const parcelSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pickupAddress: {
      type: addressDetailsSchema,
      required: true,
    },
    dropAddress: {
      type: addressDetailsSchema,
      required: true,
    },
    packageDetails: {
      type: packageDetailsSchema,
      required: true,
    },
    /** Preferred courier company for drop-off (e.g. Blue Dart, DTDC). */
    courierCompany: {
      type: String,
      trim: true,
      default: "",
    },
    /** Destination city where the parcel should go. */
    destinationCity: {
      type: String,
      trim: true,
      default: "",
    },
    /** Preferred date / window end for parcel pickup. */
    preferredPickupDate: {
      type: Date,
      default: null,
    },
    /** When delivery boy can come: today | 7_days | 15_days | 30_days | specific */
    pickupWindow: {
      type: String,
      enum: ["today", "7_days", "15_days", "30_days", "specific"],
      default: "today",
    },
    /** Number of days in window (0 for today, null for specific date). */
    pickupWindowDays: {
      type: Number,
      default: 0,
    },
    weight: {
      type: Number,
      required: true,
      max: 50,
    },
    distance: {
      type: Number,
      required: true,
    },
    fare: {
      type: Number,
      required: true,
    },
    /** Snapshot used for rider payout (base + distance only; weight excluded). */
    fareBreakdown: {
      baseFare: { type: Number, default: 0 },
      distanceFare: { type: Number, default: 0 },
      weightFare: { type: Number, default: 0 },
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["UPI", "CARD", "WALLET", "COD"],
      required: true,
    },
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      default: null,
      index: true,
    },
    searchExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    searchMeta: {
      radiusKm: { type: Number, default: 5 },
      attempt: { type: Number, default: 1 },
      lastBroadcastAt: { type: Date, default: null },
    },
    skippedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    }],
    acceptedAt: {
      type: Date,
      default: null,
    },
    otp: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "REQUESTED",
        "SEARCHING",
        "ACCEPTED",
        "RIDER_ASSIGNED",
        "PICKUP_REACHED",
        "PICKED_UP",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "CANCELLED"
      ],
      default: "REQUESTED",
      index: true,
    },
    pickupProofImage: {
      type: String,
      default: "",
    },
    deliveryProofImage: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Parcel", parcelSchema);
