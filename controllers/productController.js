const mongoose = require("mongoose");
const Product = require("../models/Product");
const asyncHandler = require("../middleware/asyncHandler");

// POST /api/products - create a product
const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
});

// GET /api/products - filter, sort and paginate
const getProducts = asyncHandler(async (req, res) => {
  const {
    category, search, minPrice, maxPrice, sort = "createdAt",
    order = "desc", page = 1, limit = 10
  } = req.query;

  const filter = {};
  if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, "i");
  if (search) {
    const safeSearch = escapeRegex(search);
    filter.$or = [
      { name: { $regex: safeSearch, $options: "i" } },
      { sku: { $regex: safeSearch, $options: "i" } },
      { supplier: { $regex: safeSearch, $options: "i" } }
    ];
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = Number(minPrice);
    if (maxPrice !== undefined) filter.price.$lte = Number(maxPrice);
    if (Object.values(filter.price).some(Number.isNaN)) {
      return res.status(400).json({ message: "minPrice and maxPrice must be valid numbers." });
    }
  }

  const allowedSortFields = ["name", "price", "quantity", "category", "createdAt", "updatedAt"];
  const sortField = allowedSortFields.includes(sort) ? sort : "createdAt";
  const sortOrder = String(order).toLowerCase() === "asc" ? 1 : -1;
  const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize),
    Product.countDocuments(filter)
  ]);

  res.json({
    total,
    page: pageNumber,
    totalPages: Math.ceil(total / pageSize),
    count: products.length,
    products
  });
});

// GET /api/products/:id - get one product
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found." });
  res.json(product);
});

// PUT /api/products/:id - update product details
const updateProduct = asyncHandler(async (req, res) => {
  const allowedFields = ["name", "sku", "category", "price", "quantity", "reorderLevel", "supplier"];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  const product = await Product.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
    context: "query"
  });
  if (!product) return res.status(404).json({ message: "Product not found." });
  res.json(product);
});

// PATCH /api/products/:id/stock - increment/decrement stock safely
const adjustStock = asyncHandler(async (req, res) => {
  const change = Number(req.body.change);
  if (!Number.isInteger(change) || change === 0) {
    return res.status(400).json({ message: "change must be a non-zero integer (positive to restock, negative for sale)." });
  }

  const filter = { _id: req.params.id };
  if (change < 0) filter.quantity = { $gte: Math.abs(change) };

  const product = await Product.findOneAndUpdate(
    filter,
    { $inc: { quantity: change } },
    { new: true, runValidators: true }
  );

  if (!product) {
    const exists = await Product.exists({ _id: req.params.id });
    if (!exists) return res.status(404).json({ message: "Product not found." });
    return res.status(400).json({ message: "Insufficient stock. Quantity cannot become negative." });
  }

  res.json({ message: "Stock updated.", product });
});

// DELETE /api/products/:id - delete a product
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found." });
  res.json({ message: "Product deleted.", id: product._id });
});

// GET /api/products/low-stock - products at/below reorder level
const getLowStockProducts = asyncHandler(async (req, res) => {
  const lowStockItems = await Product.find({
    $expr: { $lte: ["$quantity", "$reorderLevel"] }
  }).sort({ quantity: 1 });

  res.json({ count: lowStockItems.length, lowStockItems });
});

// GET /api/products/summary - category-wise aggregation
const getCategorySummary = asyncHandler(async (req, res) => {
  const summary = await Product.aggregate([
    {
      $group: {
        _id: "$category",
        totalItems: { $sum: 1 },
        totalQuantity: { $sum: "$quantity" },
        totalStockValue: { $sum: { $multiply: ["$price", "$quantity"] } },
        avgPrice: { $avg: "$price" }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        category: "$_id",
        totalItems: 1,
        totalQuantity: 1,
        totalStockValue: { $round: ["$totalStockValue", 2] },
        avgPrice: { $round: ["$avgPrice", 2] }
      }
    }
  ]);

  res.json({
    categories: summary.length,
    summary
  });
});

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  adjustStock,
  deleteProduct,
  getLowStockProducts,
  getCategorySummary
};
