import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "./models/Product.js";

dotenv.config();

const app = express();
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Database connected");
  })
  .catch((err) => {
    console.log("Database error:", err.message);
  });

app.post("/api/products", async (req, res, next) => {
  try {
    const newProduct = new Product(req.body);
    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (err) {
    next(err);
  }
});

app.get("/api/products", async (req, res, next) => {
  try {
    const category = req.query.category;
    const search = req.query.search;
    const sortBy = req.query.sortBy;
    const order = req.query.order;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const queryObj = {};
    if (category) {
      queryObj.category = category;
    }
    if (search) {
      queryObj.name = { $regex: search, $options: "i" };
    }

    const total = await Product.countDocuments(queryObj);
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    let findQuery = Product.find(queryObj);

    if (sortBy) {
      if (order === "desc") {
        findQuery = findQuery.sort({ [sortBy]: -1 });
      } else {
        findQuery = findQuery.sort({ [sortBy]: 1 });
      }
    }

    const products = await findQuery.skip(skip).limit(limit);

    res.status(200).json({
      total: total,
      page: page,
      totalPages: totalPages,
      count: products.length,
      products: products
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/products/low-stock", async (req, res, next) => {
  try {
    const allProducts = await Product.find();
    const lowStockItems = [];

    for (let i = 0; i < allProducts.length; i++) {
      if (allProducts[i].quantity <= allProducts[i].reorderLevel) {
        lowStockItems.push(allProducts[i]);
      }
    }

    res.status(200).json({
      count: lowStockItems.length,
      lowStockItems: lowStockItems
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/products/summary", async (req, res, next) => {
  try {
    const summary = await Product.aggregate([
      {
        $group: {
          _id: "$category",
          totalItems: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalStockValue: { $sum: { $multiply: ["$price", "$quantity"] } },
          avgPrice: { $avg: "$price" }
        }
      }
    ]);

    res.status(200).json({
      categories: summary.length,
      summary: summary
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/products/:id", async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json(product);
  } catch (err) {
    next(err);
  }
});

app.put("/api/products/:id", async (req, res, next) => {
  try {
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!updated) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

app.patch("/api/products/:id/stock", async (req, res, next) => {
  try {
    const change = Number(req.body.change);
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const newQty = product.quantity + change;
    if (newQty < 0) {
      return res.status(400).json({ message: "Not enough stock" });
    }

    product.quantity = newQty;
    const saved = await product.save();

    res.status(200).json({
      message: "Stock updated",
      product: saved
    });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/products/:id", async (req, res, next) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json({
      message: "Product deleted",
      id: req.params.id
    });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.log(err.message);
  res.status(500).json({ message: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});