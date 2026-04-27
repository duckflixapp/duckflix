export type ParsedDevice = {
    deviceName: string;
    deviceType: DeviceType;
    osName: string;
    browserName: string;
};

type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export type ClientHints = {
    brands?: string;
    mobile?: string;
    platform?: string;
};

export type DeviceContext = {
    userAgent?: string | null;
    clientHints?: ClientHints;
};

const cleanClientHintValue = (value?: string | null) => value?.trim().replace(/^"|"$/g, '');

const parseBrands = (brands?: string) => {
    if (!brands) return 'Unknown Browser';

    const brandNames = [...brands.matchAll(/"([^"]+)";v="\d+"/g)].map((match) => match[1]).filter(Boolean);
    const knownBrands = [
        ['Brave', 'Brave'],
        ['Microsoft Edge', 'Edge'],
        ['Google Chrome', 'Chrome'],
        ['Chromium', 'Chromium'],
        ['Opera', 'Opera'],
    ] as const;

    for (const [brand, browser] of knownBrands) {
        if (brandNames.includes(brand)) return browser;
    }

    return 'Unknown Browser';
};

const parseClientHintPlatform = (platform?: string) => {
    const normalizedPlatform = cleanClientHintValue(platform);

    if (!normalizedPlatform) return null;
    if (/macOS/i.test(normalizedPlatform)) return { osName: 'macOS', deviceName: 'Mac', deviceType: 'desktop' as const };
    if (/Windows/i.test(normalizedPlatform)) return { osName: 'Windows', deviceName: 'Windows PC', deviceType: 'desktop' as const };
    if (/Android/i.test(normalizedPlatform)) return { osName: 'Android', deviceName: 'Android Device', deviceType: 'unknown' as const };
    if (/iOS/i.test(normalizedPlatform)) return { osName: 'iOS', deviceName: 'iOS Device', deviceType: 'unknown' as const };
    if (/Linux/i.test(normalizedPlatform)) return { osName: 'Linux', deviceName: 'Linux PC', deviceType: 'desktop' as const };

    return { osName: normalizedPlatform, deviceName: normalizedPlatform, deviceType: 'unknown' as const };
};

const parseOs = (userAgent: string) => {
    if (/iPad/i.test(userAgent)) return { osName: 'iOS', deviceName: 'iPad', deviceType: 'tablet' as const };
    if (/iPhone|iPod/i.test(userAgent)) return { osName: 'iOS', deviceName: 'iPhone', deviceType: 'mobile' as const };
    if (/Android/i.test(userAgent)) {
        return {
            osName: 'Android',
            deviceName: /Mobile/i.test(userAgent) ? 'Android Phone' : 'Android Tablet',
            deviceType: /Mobile/i.test(userAgent) ? ('mobile' as const) : ('tablet' as const),
        };
    }
    if (/Windows NT/i.test(userAgent)) return { osName: 'Windows', deviceName: 'Windows PC', deviceType: 'desktop' as const };
    if (/Mac OS X|Macintosh/i.test(userAgent)) return { osName: 'macOS', deviceName: 'Mac', deviceType: 'desktop' as const };
    if (/Linux/i.test(userAgent)) return { osName: 'Linux', deviceName: 'Linux PC', deviceType: 'desktop' as const };

    return { osName: 'Unknown OS', deviceName: 'Unknown Device', deviceType: 'unknown' as const };
};

const parseBrowser = (userAgent: string) => {
    if (/Edg\//i.test(userAgent)) return 'Edge';
    if (/OPR\//i.test(userAgent)) return 'Opera';
    if (/SamsungBrowser\//i.test(userAgent)) return 'Samsung Internet';
    if (/CriOS\//i.test(userAgent)) return 'Chrome';
    if (/FxiOS\//i.test(userAgent)) return 'Firefox';
    if (/Chrome\//i.test(userAgent) && !/Chromium\//i.test(userAgent)) return 'Chrome';
    if (/Firefox\//i.test(userAgent)) return 'Firefox';
    if (/Safari\//i.test(userAgent) && /Version\//i.test(userAgent)) return 'Safari';

    return 'Unknown Browser';
};

export const parseDevice = (context?: string | null | DeviceContext): ParsedDevice => {
    const userAgent = typeof context === 'string' || context == null ? context : context.userAgent;
    const clientHints = typeof context === 'string' || context == null ? undefined : context.clientHints;
    const normalizedUserAgent = userAgent ?? '';
    const os = parseOs(normalizedUserAgent);
    const hintedOs = parseClientHintPlatform(clientHints?.platform);
    const browserName = parseBrands(clientHints?.brands);
    const resolvedBrowserName = browserName === 'Unknown Browser' ? parseBrowser(normalizedUserAgent) : browserName;
    const resolvedDeviceType: DeviceType | undefined =
        clientHints?.mobile === '?1'
            ? 'mobile'
            : clientHints?.mobile === '?0' && hintedOs?.deviceType === 'unknown'
              ? 'desktop'
              : undefined;
    const resolvedOs = hintedOs
        ? {
              ...hintedOs,
              deviceType: resolvedDeviceType ?? hintedOs.deviceType,
          }
        : os;
    const deviceName =
        resolvedBrowserName === 'Unknown Browser' && resolvedOs.deviceName === 'Unknown Device'
            ? 'Unknown Device'
            : `${resolvedBrowserName} on ${resolvedOs.deviceName}`;

    return {
        deviceName,
        deviceType: resolvedOs.deviceType,
        osName: resolvedOs.osName,
        browserName: resolvedBrowserName,
    };
};
