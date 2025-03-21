import { app, BrowserWindow } from 'electron';

const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    });

    win.loadURL('https://script.google.com/macros/s/AKfycbzL3OhugtXrIkNGkwLPgLjAMX1W5L0CBwDT0htMPhRVxI8ccbqXQsCXci5qH8c0_Hmj3A/exec'); // يمكنك تغيير الرابط أو تحميل ملف HTML محلي
};

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
