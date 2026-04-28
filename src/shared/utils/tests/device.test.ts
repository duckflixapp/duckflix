import { describe, expect, test } from 'bun:test';
import { parseDevice } from '../device';

describe('parseDevice', () => {
    test('detects Safari on iPhone', () => {
        const result = parseDevice(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        );

        expect(result).toEqual({
            browserName: 'Safari',
            deviceName: 'Safari on iPhone',
            deviceType: 'mobile',
            osName: 'iOS',
        });
    });

    test('detects Chrome on Windows', () => {
        const result = parseDevice(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        );

        expect(result).toEqual({
            browserName: 'Chrome',
            deviceName: 'Chrome on Windows PC',
            deviceType: 'desktop',
            osName: 'Windows',
        });
    });

    test('detects Chrome on Android phone', () => {
        const result = parseDevice(
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36'
        );

        expect(result).toEqual({
            browserName: 'Chrome',
            deviceName: 'Chrome on Android Phone',
            deviceType: 'mobile',
            osName: 'Android',
        });
    });

    test('prefers client hints over the user agent', () => {
        const result = parseDevice({
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
            clientHints: {
                brands: '"Brave";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
                mobile: '?0',
                platform: '"macOS"',
            },
        });

        expect(result).toEqual({
            browserName: 'Brave',
            deviceName: 'Brave on Mac',
            deviceType: 'desktop',
            osName: 'macOS',
        });
    });
});
