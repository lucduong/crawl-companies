const mongoose = require('mongoose')
const request = require('request-promise')
const cheerio = require('cheerio')
const _ = require('lodash')

const Company = require('./models/Company')

const URL = 'https://chuyencuadev.com/'
const companyCount = 3491 // Cái này là mình thấy trên trang này nó ghi vậy. =))
const pageSize = 20 // Đã test. :)
const pageCount = parseInt(companyCount / pageSize)

/**
 * Get content for each page
 * 
 * @param {*} uri (Ex: ${URL}page/2)
 */
const getPageContent = (uri) => {
  const options = {
    uri,
    headers: {
      'User-Agent': 'Request-Promise'
    },
    transform: (body) => {
      return cheerio.load(body)
    }
  }

  return request(options)
    .then(($) => {
      return {
        $,
        uri,
      }
    })
}

/**
 * Parse html to company Object
 * 
 * #list-companies
 *  .tile
 *    .tile-icon img src (logo link)
 *    .tile-content
 *      .tile-title [0] => Company Name & Review Link
 *        a href (review link)
 *          text (company name)
 *      .tile-title [1] => Info (Location, type, size, country, working time)
 *        icon
 *        text (Info - Repeat 5 times)
 *      .tile-title [2] => Reviews (count, avg)
 *        a>span text => count
 *        >span
 *          i*5 (i | i.none)
 * 
 * @param {*} $ 
 */
const html2Company = ($) => {
  // logo
  const logo = $.find('.tile-icon img').attr('data-original')
  const cName = $.find('.tile-content .tile-title:nth-child(1) a')
  const name = cName.find('span').text()
  const reviewLink = cName.attr('href')
  $.find('.tile-content .tile-title:nth-child(2) i').replaceWith('|')
  const details = $.find('.tile-content .tile-title:nth-child(2)')
    .html().split('|').map(d => d.replace(/^\s+/, ''))
  const reviews = $.find('.tile-content .tile-title:nth-child(3)')
  const reviewCount = reviews.find('a>span').text()
  const star = reviews.find('>span i:not(.none)').length

  return {
    name,
    reviewLink,
    logo,
    location: details[1],
    type: details[2],
    size: details[3],
    country: details[4],
    reviewCount,
    star,
  }
}

/**
 * Parse html to companies
 * 
 * @param {*} $ 
 */
const html2Companies = ($) => {
  const companies = []
  $('#list-companies .tile').each((_, c) => {
    companies.push(html2Company($(c)))
  })
  return companies
}

const createCompanies = (companies) => {
  return Promise.all(companies.map(c => Company.findOneAndUpdate({ name: c.name }, { $set: c }, { upsert: true })))
}

const crawlPage = (uri) => {
  let isError = false
  return getPageContent(uri)
    .then(({ uri, $ }) => {
      return html2Companies($)
    }).catch(error => {
      isError = true
    }).then((companies) => {
      return isError ? uri : companies
    })
}

const crawl = async(pages, results) => {
  const chunks = await Promise.all(pages.map(uri => crawlPage(uri)))
  const availableChunks = _.filter(chunks, c => typeof c === 'object')
  const remainPages = _.filter(chunks, c => typeof c === 'string')
  if (availableChunks.length > 0) {
    results = await Promise.all(availableChunks.map(companies => createCompanies(companies)))
      .then((data) => data.reduce((page1, page2) => page1.concat(page2)))
  }
  if (remainPages && remainPages.length > 0) {
    console.log(`Remain ${remainPages.length}.`)
    results = results.concat(await crawl(remainPages, results))
  }
  return results
}

mongoose.Promise = global.Promise
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crawl', {
  useMongoClient: true
}, (error) => {
  if (error) {
    console.log('%s MongoDB connection error. Please make sure MongoDB is running.', chalk.red('✗'))
    process.exit()
  }

  console.time('crawl > ')
  const pages = [`${URL}`]
  for (let i = 2; i <= pageCount; i++) {
    pages.push(`${URL}page/${i}`)
  }
  const results = []
  crawl(pages, results).then((companies) => {
    if (!companies)
      return
    console.log(`Created ${companies.length} companies`)
    return
  }).then(() => {
    console.timeEnd('crawl > ')
    process.exit()
  })
})
