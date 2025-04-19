// src/middleware/validationMessage.js
module.exports = errorsArray =>
  errorsArray.length ? errorsArray[0].msg : 'Validation failed';