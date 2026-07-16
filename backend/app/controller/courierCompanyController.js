import CourierCompany from "../models/courierCompany.js";
import handleResponse from "../utils/helper.js";

export const adminListCourierCompanies = async (req, res) => {
  try {
    // Do not auto-reseed here — otherwise deleting the last company
    // (or emptying the list) would immediately recreate defaults.
    const companies = await CourierCompany.find()
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    return handleResponse(res, 200, "Courier companies retrieved", companies);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const adminCreateCourierCompany = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const platformCharge = Math.max(0, Number(req.body?.platformCharge) || 0);
    const companyCharge = Math.max(0, Number(req.body?.companyCharge) || 0);
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder))
      ? Number(req.body.sortOrder)
      : 0;
    const isActive = req.body?.isActive !== false && req.body?.isActive !== "false";

    if (!name) {
      return handleResponse(res, 400, "Courier company name is required");
    }

    const existing = await CourierCompany.findOne({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    }).lean();
    if (existing) {
      return handleResponse(res, 400, "A courier company with this name already exists");
    }

    const company = await CourierCompany.create({
      name,
      platformCharge,
      companyCharge,
      sortOrder,
      isActive,
    });

    return handleResponse(res, 201, "Courier company created", company);
  } catch (error) {
    if (error?.code === 11000) {
      return handleResponse(res, 400, "A courier company with this name already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

export const adminUpdateCourierCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await CourierCompany.findById(id);
    if (!company) {
      return handleResponse(res, 404, "Courier company not found");
    }

    if (req.body?.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) {
        return handleResponse(res, 400, "Courier company name is required");
      }
      const duplicate = await CourierCompany.findOne({
        _id: { $ne: company._id },
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      }).lean();
      if (duplicate) {
        return handleResponse(res, 400, "A courier company with this name already exists");
      }
      company.name = name;
    }

    if (req.body?.platformCharge !== undefined) {
      company.platformCharge = Math.max(0, Number(req.body.platformCharge) || 0);
    }
    if (req.body?.companyCharge !== undefined) {
      company.companyCharge = Math.max(0, Number(req.body.companyCharge) || 0);
    }
    if (req.body?.sortOrder !== undefined) {
      company.sortOrder = Number(req.body.sortOrder) || 0;
    }
    if (req.body?.isActive !== undefined) {
      company.isActive = req.body.isActive === true || req.body.isActive === "true";
    }

    await company.save();
    return handleResponse(res, 200, "Courier company updated", company);
  } catch (error) {
    if (error?.code === 11000) {
      return handleResponse(res, 400, "A courier company with this name already exists");
    }
    return handleResponse(res, 500, error.message);
  }
};

export const adminDeleteCourierCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await CourierCompany.findByIdAndDelete(id);
    if (!company) {
      return handleResponse(res, 404, "Courier company not found");
    }
    return handleResponse(res, 200, "Courier company deleted", { id: company._id });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
