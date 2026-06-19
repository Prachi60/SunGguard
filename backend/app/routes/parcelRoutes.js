import express from "express";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import {
  calculateFare,
  createParcel,
  getParcelHistory,
  trackParcel,
  adminGetParcels,
  adminAssignRider,
  adminGetPricingConfig,
  adminUpdatePricingConfig,
  adminGetReports,
  adminGetActiveDeliveries,
  adminGetRiders,
  riderGetAssignedParcels,
  riderUpdateStatus,
  riderCompleteDelivery,
  riderGetEarnings
} from "../controller/parcelController.js";

const router = express.Router();

/* ==========================================================================
   CUSTOMER API ROUTES
   ========================================================================== */
router.post("/calculate-fare", verifyToken, calculateFare);
router.post("/create", verifyToken, createParcel);
router.get("/history", verifyToken, getParcelHistory);
router.get("/track/:id", verifyToken, trackParcel);

/* ==========================================================================
   ADMIN API ROUTES
   ========================================================================== */
router.get("/admin/all", verifyToken, allowRoles("admin", "parcel_admin"), adminGetParcels);
router.post("/admin/assign-rider", verifyToken, allowRoles("admin", "parcel_admin"), adminAssignRider);
router.get("/admin/pricing", verifyToken, allowRoles("admin", "parcel_admin"), adminGetPricingConfig);
router.put("/admin/pricing", verifyToken, allowRoles("admin", "parcel_admin"), adminUpdatePricingConfig);
router.get("/admin/reports", verifyToken, allowRoles("admin", "parcel_admin"), adminGetReports);
router.get("/admin/active", verifyToken, allowRoles("admin", "parcel_admin"), adminGetActiveDeliveries);
router.get("/admin/riders", verifyToken, allowRoles("admin", "parcel_admin"), adminGetRiders);

/* ==========================================================================
   DELIVERY PARTNER API ROUTES
   ========================================================================== */
router.get("/rider/assigned", verifyToken, allowRoles("delivery"), riderGetAssignedParcels);
router.put("/rider/status", verifyToken, allowRoles("delivery"), riderUpdateStatus);
router.put("/rider/complete", verifyToken, allowRoles("delivery"), riderCompleteDelivery);
router.get("/rider/earnings", verifyToken, allowRoles("delivery"), riderGetEarnings);

export default router;
