import axiosInstance from "@core/api/axios";

export const parcelApi = {
  // Customer APIs
  calculateFare: (data) => axiosInstance.post("/parcel/calculate-fare", data),
  createParcel: (data) => axiosInstance.post("/parcel/create", data),
  getHistory: () => axiosInstance.get("/parcel/history"),
  trackParcel: (id) => axiosInstance.get(`/parcel/track/${id}`),

  // Admin APIs
  adminGetParcels: () => axiosInstance.get("/parcel/admin/all"),
  adminAssignRider: (data) => axiosInstance.post("/parcel/admin/assign-rider", data),
  adminGetPricingConfig: () => axiosInstance.get("/parcel/admin/pricing"),
  adminUpdatePricingConfig: (data) => axiosInstance.put("/parcel/admin/pricing", data),
  adminGetReports: () => axiosInstance.get("/parcel/admin/reports"),
  adminGetActiveDeliveries: () => axiosInstance.get("/parcel/admin/active"),
  adminGetRiders: () => axiosInstance.get("/parcel/admin/riders"),

  // Rider/Delivery Partner APIs
  riderGetAssigned: () => axiosInstance.get("/parcel/rider/assigned"),
  riderUpdateStatus: (data) => axiosInstance.put("/parcel/rider/status", data),
  riderCompleteDelivery: (data) => axiosInstance.put("/parcel/rider/complete", data),
  riderGetEarnings: () => axiosInstance.get("/parcel/rider/earnings"),
};
