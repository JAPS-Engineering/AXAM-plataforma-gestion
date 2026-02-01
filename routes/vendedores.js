const express = require('express');
const router = express.Router();
const vendedorController = require('../controllers/vendedorController');

router.get('/', vendedorController.getVendedores);
router.put('/:id', vendedorController.updateVendedor);


module.exports = router;
