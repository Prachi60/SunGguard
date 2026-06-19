import mongoose from "mongoose";

const parcelConfigSchema = new mongoose.Schema(
  {
    baseFare: {
      type: Number,
      default: 40,
      min: 0,
    },
    perKmCharge: {
      type: Number,
      default: 10,
      min: 0,
    },
    weightCharge: {
      type: Number,
      default: 15, // Charge per KG (so if package is 0.5 KG, weight charge = 0.5 * 15 = 7.5)
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Helper static method to get the singleton config or create default
parcelConfigSchema.statics.getOrCreate = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({
      baseFare: 40,
      perKmCharge: 10,
      weightCharge: 15,
    });
  }
  return config;
};

export default mongoose.model("ParcelConfig", parcelConfigSchema);
