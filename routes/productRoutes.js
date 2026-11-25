const express = require("express");
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  adjustStock,
  deleteProduct,
  getLowStockProducts,
  getCategorySummary
} = require("../controllers/productController");

const router = express.Router();

router.route("/").post(createProduct).get(getProducts);
router.get("/low-stock", getLowStockProducts);
router.get("/summary", getCategorySummary);
router.patch("/:id/stock", adjustStock);
router.route("/:id").get(getProductById).put(updateProduct).delete(deleteProduct);

module.exports = router;
