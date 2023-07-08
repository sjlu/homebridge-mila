import { Service, PlatformAccessory, CharacteristicValue, Logger, PlatformConfig } from 'homebridge';
import { MilaHomebridgePlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MilaPlatformAccessory {
  private airPurifierService: Service;
  private airQualityService: Service;
  private humidityService: Service;
  private temperatureService: Service;
  private carbonDioxideService: Service;
  private carbonMonoxideService: Service;
  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private state = {
    state: 0, // 0 = inactive, 1 = idle, 2 = Purifying Air,
    Mode: 0, // 0 = manual, 1 = auto
    Speed: 0,
    On: 0,
    AirQuality: 0,
    PM10: 0,
    PM2_5: 0,
    Voc: 0,
    Humidity: 0,
    Temperature: 0,
    CO2: 0,
    CO2State: 0,
    CO: 0,
    COState: 0
  };

  constructor (
    private readonly platform: MilaHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly config: PlatformConfig,
    private readonly log: Logger,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Mila')
      // .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id);
    // .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareVersion)

    // get the AirPurifier service if it exists, otherwise create a new AirPurifier service
    // you can create multiple services for each accessory
    this.airPurifierService = this.accessory.getService(this.platform.Service.AirPurifier) ||
      this.accessory.addService(this.platform.Service.AirPurifier);
    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.airPurifierService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/AirPurifier

    // register handlers for the On/Off Characteristic
    this.airPurifierService.getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.handleActiveSet.bind(this)) // SET - bind to the `handleActiveSet` method below
      .onGet(this.handleActiveGet.bind(this)); // GET - bind to the `handleActiveGet` method below
    // register handlers for the CurrentAirPurifierState Characteristic
    this.airPurifierService.getCharacteristic(this.platform.Characteristic.CurrentAirPurifierState)
      .onGet(this.getState.bind(this)); // GET - bind to the `getState` method below
    // register handlers for the TargetAirPurifierState Characteristic
    this.airPurifierService.getCharacteristic(this.platform.Characteristic.TargetAirPurifierState)
      .onSet(this.handleAutoSet.bind(this))
      .onGet(this.handleAutoGet.bind(this));
    this.airPurifierService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onSet(this.setSpeed.bind(this))
      .onGet(this.getSpeed.bind(this));

    // AirQuality Sensor
    this.airQualityService = this.accessory.getService(this.platform.Service.AirQualitySensor) ||
      this.accessory.addService(this.platform.Service.AirQualitySensor);

    this.airQualityService.getCharacteristic(this.platform.Characteristic.AirQuality)
      .onGet(this.handleAirQualityGet.bind(this));
    this.airQualityService.getCharacteristic(this.platform.Characteristic.PM10Density)
      .onGet(this.handlePM10DensityGet.bind(this));
    this.airQualityService.getCharacteristic(this.platform.Characteristic.PM2_5Density)
      .onGet(this.handlePM2_5DensityGet.bind(this));
    this.airQualityService.getCharacteristic(this.platform.Characteristic.VOCDensity)
      .onGet(this.handleVOCDensityGet.bind(this));


    // Humidity Sensor
    this.humidityService = this.accessory.getService(this.platform.Service.HumiditySensor) ||
      this.accessory.addService(this.platform.Service.HumiditySensor);

    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.handleHumidityGet.bind(this));

    // Temperature Sensor
    this.temperatureService = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(this.platform.Service.TemperatureSensor);

    this.humidityService.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleTemperatureGet.bind(this));

    // CO2 Sensor
    this.carbonDioxideService = this.accessory.getService(this.platform.Service.CarbonDioxideSensor) ||
      this.accessory.addService(this.platform.Service.CarbonDioxideSensor);

    this.carbonDioxideService.getCharacteristic(this.platform.Characteristic.CarbonDioxideDetected)
      .onGet(this.handleCarbonDioxideDetectedGet.bind(this));
    this.carbonDioxideService.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel)
      .onGet(this.handleCarbonDioxideLevelGet.bind(this));

    // CO Sensor
    this.carbonMonoxideService = this.accessory.getService(this.platform.Service.CarbonMonoxideSensor) ||
      this.accessory.addService(this.platform.Service.CarbonMonoxideSensor);

    this.carbonMonoxideService.getCharacteristic(this.platform.Characteristic.CarbonMonoxideDetected)
      .onGet(this.handleCarbonMonoxideDetectedGet.bind(this));
    this.carbonMonoxideService.getCharacteristic(this.platform.Characteristic.CarbonMonoxideLevel)
      .onGet(this.handleCarbonMonoxideLevelGet.bind(this));

    // When finished, take the device and sync
    this.syncAccessory(accessory.context.device);

    // this.airPurifierService.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
    //   .onGet(this.getFilterChange.bind(this))
    // this.airPurifierService.getCharacteristic(this.platform.Characteristic.FilterLifeLevel)
    //   .onGet(this.getFilterStatus.bind(this))

    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */
  }

  getRoomId () {
    return this.accessory.context.device.room.id;
  }

  syncState () {
    this.log.debug('syncState', this.state);

    this.airPurifierService.updateCharacteristic(this.platform.Characteristic.TargetAirPurifierState, this.state.Mode);
    this.airPurifierService.updateCharacteristic(this.platform.Characteristic.CurrentAirPurifierState, this.state.state);
    this.airPurifierService.updateCharacteristic(this.platform.Characteristic.On, this.state.On);
    this.airPurifierService.updateCharacteristic(this.platform.Characteristic.RotationSpeed, this.state.Speed);

    this.airQualityService.updateCharacteristic(this.platform.Characteristic.AirQuality, this.state.AirQuality);
    this.airQualityService.updateCharacteristic(this.platform.Characteristic.PM10Density, this.state.PM10);
    this.airQualityService.updateCharacteristic(this.platform.Characteristic.PM2_5Density, this.state.PM2_5);
    this.airQualityService.updateCharacteristic(this.platform.Characteristic.VOCDensity, this.state.Voc);

    this.humidityService.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.state.Humidity);

    this.temperatureService.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.state.Temperature);

    this.carbonDioxideService.updateCharacteristic(this.platform.Characteristic.CarbonDioxideDetected, this.state.CO2State);
    this.carbonDioxideService.updateCharacteristic(this.platform.Characteristic.CarbonDioxideLevel, this.state.CO2);

    this.carbonMonoxideService.updateCharacteristic(this.platform.Characteristic.CarbonMonoxideDetected, this.state.COState);
    this.carbonMonoxideService.updateCharacteristic(this.platform.Characteristic.CarbonMonoxideLevel, this.state.CO);
  }

  getAirQuality (aqi: any) {
    const quality = Math.floor(aqi / 50) + 1
    return quality > 5 ? 5 : quality
  }

  syncAccessory (device: any) {
    this.log.debug('syncAccessory', device)

    this.state.On = device.fanSpeed !== 0 ? 1 : 0;
    this.state.state = this.state.On ? 2 : 0;

    if (device.fanSpeed < 0 || device.fanSpeed > 100) {
      this.log.info(`Fan speed is ${device.fanSpeed}% at RPM ${device.sensors.FanSpeed}`)
    }
    this.state.Speed = device.fanSpeed > 0 ? device.fanSpeed : 0;

    this.state.AirQuality = this.getAirQuality(device.sensors.Aqi);
    this.state.PM10 = Math.round(device.sensors.Pm10);
    this.state.PM2_5 = Math.round(device.sensors.Pm2_5);
    this.state.Voc = Math.round(device.sensors.Voc);
    this.state.Humidity = Math.round(device.sensors.Humidity);
    this.state.Temperature = Math.round(device.sensors.Temperature * 10) / 10;
    this.state.CO2 = Math.round(device.sensors.Co2);
    this.state.CO2State = this.state.CO2 > (this.config.co2_threshold || 1000) ? 1 : 0; // Mila considers 1000+ to be abnormal
    this.state.CO = Math.round(device.sensors.Co);
    this.state.COState = this.state.CO > (this.config.co_threshold || 100) ? 1 : 0; // Mila doesn't publish numbers but 100 seems to be the abnormal number

    this.syncState();
  }

  async getAndSyncAccessory () {
    const device = await this.platform.milaClient.getAppliance(this.accessory.context.device.id);
    this.syncAccessory(device)
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async handleActiveSet (value: CharacteristicValue) {
    this.log.info(`handleActiveSet ${value}`)

    // only change if we're turning off or going from Off to On otherwise this
    // gets called with fan speed being set causing a race-condition
    if (!value || (!this.state.On && value)) {
      await this.platform.milaClient.setRoomManualFanSpeed(this.getRoomId(), value ? this.state.Speed : 0);
    }
    this.state.On = value ? 1 : 0;
    this.state.state = this.state.On ? 2 : 0;
    this.syncState()
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience() in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.
   * @example
   * this.airPurifierService.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async handleActiveGet (): Promise<CharacteristicValue> {
    await this.getAndSyncAccessory();
    // if (await this.updateStates() === 1) {
    //   throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
    // }
    this.log.info(`${this.accessory.context.device.name} state is: ${this.state.On}`);
    return this.state.On;
    // if you need to return an error to show the device as "Not Responding" in the Home app:
    // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  async getState (): Promise<CharacteristicValue> {
    return this.state.state;
  }

  async handleAutoSet (value: CharacteristicValue) {
    this.log.info(`handleAutoSet ${value}`)

    if (value) {
      await this.platform.milaClient.setAutomagicMode(this.getRoomId())
    } else {
      await this.platform.milaClient.setRoomManualFanSpeed(this.getRoomId(), this.state.Speed)
    }

    this.state.Mode = value ? 1 : 0

    this.syncState();

    // this.airPurifierService.updateCharacteristic(this.platform.Characteristic.TargetAirPurifierState, 0);
  }

  async handleAutoGet () {
    return this.state.Mode;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the speed
   */
  async setSpeed (value: CharacteristicValue) {
    this.log.info(`setSpeed ${value}`)

    const { fanSpeed } = await this.platform.milaClient.setRoomManualFanSpeed(this.getRoomId(), value as number);
    this.state.Speed = fanSpeed;

    this.syncState();
  }

  async getSpeed ():Promise<CharacteristicValue> {
    return this.state.Speed;
  }

  async handleAirQualityGet (): Promise<CharacteristicValue> {
    await this.getAndSyncAccessory();
    return this.state.AirQuality;
  }

  async handlePM10DensityGet () {
    return this.state.PM10;
  }

  async handlePM2_5DensityGet () {
    return this.state.PM2_5;
  }

  async handleVOCDensityGet () {
    return this.state.Voc;
  }

  async handleHumidityGet (): Promise<CharacteristicValue> {
    await this.getAndSyncAccessory();
    return this.state.Humidity;
  }

  async handleTemperatureGet (): Promise<CharacteristicValue> {
    await this.getAndSyncAccessory();
    return this.state.Temperature;
  }

  async handleCarbonDioxideDetectedGet (): Promise<CharacteristicValue> {
    await this.getAndSyncAccessory();
    return this.state.CO2State;
  }

  async handleCarbonDioxideLevelGet () {
    return this.state.CO2;
  }

  async handleCarbonMonoxideDetectedGet (): Promise<CharacteristicValue> {
    await this.getAndSyncAccessory();
    return this.state.COState;
  }

  async handleCarbonMonoxideLevelGet () {
    return this.state.CO;
  }

  // async getFilterChange (): Promise<CharacteristicValue> {
  //   if (this.state.Filter > this.config.threshold) return 0
  //   else return 1
  // }

  // async getFilterStatus (): Promise<CharacteristicValue> {
  //   this.log.debug('Check Filter State: ' + this.state.Filter)
  //   return this.state.Filter
  // }
}
