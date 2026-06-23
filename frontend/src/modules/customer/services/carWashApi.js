import axiosInstance from "@core/api/axios";

export const carWashApi = {
  // Customer APIs
  getPackages: () => axiosInstance.get("/car-wash/packages"),
  calculateFare: (data) => axiosInstance.post("/car-wash/calculate-fare", data),
  createBooking: (data) => axiosInstance.post("/car-wash/booking", data),
  getCustomerBookings: () => axiosInstance.get("/car-wash/bookings/customer"),
  getBookingDetails: (id) => axiosInstance.get(`/car-wash/bookings/${id}`),
  cancelBooking: (id) => axiosInstance.post(`/car-wash/bookings/${id}/cancel`),
  addReview: (id, data) => axiosInstance.post(`/car-wash/bookings/${id}/review`, data),

  // Partner APIs
  partnerGetAvailable: () => axiosInstance.get("/car-wash/partner/available"),
  partnerGetAssigned: () => axiosInstance.get("/car-wash/partner/assigned"),
  partnerAccept: (data) => axiosInstance.post("/car-wash/partner/accept", data),
  partnerUpdateStatus: (data) => axiosInstance.put("/car-wash/partner/status", data),
  partnerComplete: (data) => axiosInstance.put("/car-wash/partner/complete", data),

  // Admin APIs
  adminGetBookings: () => axiosInstance.get("/car-wash/admin/bookings"),
  adminAssignPartner: (data) => axiosInstance.post("/car-wash/admin/assign-partner", data),
  adminGetConfig: () => axiosInstance.get("/car-wash/admin/config"),
  adminUpdateConfig: (data) => axiosInstance.put("/car-wash/admin/config", data),
  adminCreatePackage: (data) => axiosInstance.post("/car-wash/admin/packages", data),
  adminUpdatePackage: (id, data) => axiosInstance.put(`/car-wash/admin/packages/${id}`, data),
  adminDeletePackage: (id) => axiosInstance.delete(`/car-wash/admin/packages/${id}`),
  adminGetReports: () => axiosInstance.get("/car-wash/admin/reports"),
};
