const moment = require('moment');

export interface DateTimeService {
  getCurrentTime(format?: string): string;
  formatDate(date: Date | number | string, format?: string): string;
  getDuration(startTime: any, endTime: any): {
    milliseconds: number;
    seconds: number;
    minutes: number;
    hours: number;
    asMilliseconds(): number;
    asSeconds(): number;
    asMinutes(): number;
    asHours(): number;
  };
  isOlderThan(timestamp: number | Date | string, minutes: number): boolean;
  getCurrentTimestamp(): any;
  diff(date1: any, date2: any, unit?: string): number;
}

class DateTimeServiceImpl implements DateTimeService {
  getCurrentTime(format: string = 'YYYY-MM-DD HH:mm:ss'): string {
    return moment().format(format);
  }

  formatDate(date: Date | number | string, format: string = 'YYYY-MM-DD HH:mm:ss'): string {
    return moment(date).format(format);
  }

  getDuration(startTime: any, endTime: any) {
    const duration = moment.duration(moment(endTime).diff(moment(startTime)));
    return {
      milliseconds: duration.milliseconds(),
      seconds: duration.seconds(),
      minutes: duration.minutes(),
      hours: duration.hours(),
      asMilliseconds: () => duration.asMilliseconds(),
      asSeconds: () => duration.asSeconds(),
      asMinutes: () => duration.asMinutes(),
      asHours: () => duration.asHours()
    };
  }

  isOlderThan(timestamp: number | Date | string, minutes: number): boolean {
    const inputTime = moment(timestamp);
    const timeDiff = moment().diff(inputTime, 'minutes');
    return timeDiff > minutes;
  }

  getCurrentTimestamp(): any {
    return moment();
  }

  diff(date1: any, date2: any, unit: string = 'milliseconds'): number {
    return moment(date1).diff(moment(date2), unit);
  }
}

const dateTimeService = new DateTimeServiceImpl();

module.exports = dateTimeService;