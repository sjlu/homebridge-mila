const Promise = require('bluebird')
const request = Promise.promisify(require('request'))
const uuid = require('uuid')
const crypto = require('crypto')
const URI = require('urijs')
const _ = require('lodash')
const { GraphQLClient, gql } = require('graphql-request')

const LOGIN_API_URL = 'https://id.milacares.com'
const REDIRECT_URI = 'milacares://anyurl.com/'
const CLIENT_ID = 'prod-ui'

const FAN_MIN = 500
const FAN_MAX = 2000

function milaFanPercentage (min, max, val) {
  if (val <= FAN_MIN) {
    return 0
  }
  if (val >= FAN_MAX) {
    return 100
  }
  return Math.round((val - min) / (max - min) * 10) * 10
}

function sha256 (str) {
  return crypto.createHash('sha256').update(str).digest('hex')
}

function pkceChallenge () {
  const codeVerifier = crypto
    .randomBytes(60)
    .toString('hex')
    .slice(0, 128)

  const codeChallenge = crypto
    .createHash('sha256')
    .update(Buffer.from(codeVerifier))
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return {
    codeChallenge,
    codeVerifier
  }
}

async function getLoginPage () {
  const jar = request.jar()

  const pkce = pkceChallenge()

  const resp = await request({
    method: 'GET',
    baseUrl: LOGIN_API_URL,
    url: '/auth/realms/prod/protocol/openid-connect/auth',
    followRedirect: false,
    jar,
    qs: {
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: 'openid,profile',
      redirect_uri: REDIRECT_URI,
      state: uuid.v4(),
      code_challenge: pkce.codeChallenge,
      code_challenge_method: 'S256'
    }
  })

  const formAction = resp.body.match(/<form\s+.*?\s+action="(.*?)"/)[1].replace(/&amp;/g, '&')

  return {
    pkce,
    jar,
    formAction
  }
}

async function postLoginPage ({ formAction, jar }, username, password) {
  const resp = await request({
    method: 'POST',
    url: formAction,
    jar,
    followRedirect: false,
    form: {
      username,
      password
    }
  })

  const redirectUrl = new URI(resp.headers.location)
  const code = redirectUrl.search(true).code

  return code
}

async function getTokenFromCode (code, pkce) {
  const resp = await request({
    method: 'POST',
    baseUrl: LOGIN_API_URL,
    url: '/auth/realms/prod/protocol/openid-connect/token',
    json: true,
    form: {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code,
      code_verifier: pkce.codeVerifier
    }
  })

  return resp.body
}

async function getTokenFromRefreshToken (refreshToken) {
  const resp = await request({
    method: 'POST',
    baseUrl: LOGIN_API_URL,
    url: '/auth/realms/prod/protocol/openid-connect/token',
    json: true,
    form: {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken
    }
  })

  return resp.body
}

async function milaLogin (username, password) {
  const loginPage = await getLoginPage()
  const loginAuthCode = await postLoginPage(loginPage, username, password)
  const token = await getTokenFromCode(loginAuthCode, loginPage.pkce)

  return token
}

class MilaClient {
  constructor (email, password) {
    this.email = email
    this.password = password
  }

  async milaApiRequest (query) {
    if (!this.accessToken) {
      let token
      if (this.refreshToken) {
        token = await getTokenFromRefreshToken(this.refreshToken)
      } else {
        token = await milaLogin(this.email, this.password)
      }

      this.accessToken = token.access_token
      this.refreshToken = token.refresh_token

      setTimeout(() => {
        this.accessToken = null
      }, token.expires_in / 2)

      setTimeout(() => {
        this.refreshToken = null
      }, token.refresh_expires_in / 2)
    }

    const graphQLClient = new GraphQLClient('https://api.milacares.com/graphql', {
      headers: {
        Authorization: `Bearer ${this.accessToken}`
      }
    })

    return await graphQLClient.request(query)
  }

  async getProfile () {
    const resp = await this.milaApiRequest(gql`
      query {
        owner {
          profile {
            firstName,
            lastName,
            email
          }
        }
      }
    `)
  }

  async getAppliances () {
    if (this.applianceCache) {
      return this.applianceCache
    }

    const resp = await this.milaApiRequest(gql`
      query {
        owner {
          appliances {
            id,
            name,
            room {
              id,
              kind
            },
            state {
              actualMode
            },
            sensors(kinds: [FanSpeed, Aqi, Pm1, Pm2_5, Pm10, Voc, Humidity, Temperature, Co2, Co]) {
              kind,
              latest(precision: {unit: Minute, value: 1}) {
                instant,
                value
              }
            }
          }
        }
      }
    `)

    const appliances = _.map(resp.owner.appliances, (appliance) => {
      appliance.sensors = _.chain(appliance.sensors)
        .keyBy('kind')
        .mapValues((v) => {
          return v.latest.value
        })
        .value()

      appliance.name = `Mila Air Purifier ${appliance.id}`
      appliance.fanSpeed = milaFanPercentage(FAN_MIN, FAN_MAX, appliance.sensors.FanSpeed)

      return appliance
    })

    this.applianceCache = appliances

    // Cache / rate limit against the Mila GraphQL API
    setTimeout(() => {
      this.applianceCache = null
    }, 10000)

    return appliances
  }

  async getAppliance (id) {
    const appliances = await this.getAppliances()
    return _.find(appliances, { id })
  }

  async setAutomagicMode (roomId) {
    const resp = await this.milaApiRequest(gql`
      mutation {
        applyRoomAutomagicMode(roomId: ${roomId}) {
          id
        }
      }
    `)
  }

  async setRoomManualFanSpeed (roomId, fanSpeed) {
    fanSpeed = Math.round(fanSpeed / 10) * 10;

    const resp = await this.milaApiRequest(gql`
      mutation {
        applyRoomManualMode(roomId: ${roomId}, targetAqi: 10, fanSpeed: ${fanSpeed}) {
          id
        }
      }
    `)

    // cache busting
    this.applianceCache = null

    return { fanSpeed }
  }
}

module.exports = MilaClient
