import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.moranjianghu.game',
    appName: '墨色江湖',
    webDir: 'dist',
    server: {
        androidScheme: 'https',
        cleartext: true,
        allowNavigation: ['*']
    },
    android: {
        backgroundColor: '#000000',
        allowMixedContent: true
    },
    plugins: {
        CapacitorHttp: {
            enabled: true
        }
    }
};

export default config;
