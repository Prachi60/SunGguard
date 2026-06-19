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
    enum: ["document", "food", "clothes", "electronics", "other"],
  },
  weight: {
    type: Number,
    required: true,
    max: 1.0, // max 1 KG
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
    weight: {
      type: Number,
      required: true,
      max: 1.0,
    },
    distance: {
      type: Number,
      required: true,
    },
    fare: {
      type: Number,
      required: true,
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
    otp: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "REQUESTED",
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
