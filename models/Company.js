const mongoose = require('mongoose')
const Schema = mongoose.Schema

const companySchema = new Schema({
  name: String,
  reviewLink: String,
  logo: String,
  location: String,
  type: String,
  country: String,
  workingTime: String,
  reviewCount: Number,
  star: Number,
}, {
  timestamps: true
})

const Company = mongoose.model('Company', companySchema)

module.exports = Company
