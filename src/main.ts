import {app, BrowserWindow, Notification, systemPreferences, ipcMain, Menu, Tray} from 'electron'
import {NOTIFICATION} from './ini'

declare const MAIN_WINDOW_WEBPACK_ENTRY: string

if (require('electron-squirrel-startup')) {
    app.quit()
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
}

interface MainInterface {
    data: {
        snoozeTime: number
        openNotificationTimeStamp: number
        notification: Notification
        mainWindow: BrowserWindow
        backgroundWindow: BrowserWindow
        tray: Tray
    }
    init: () => void
    createForwardWindow: () => void
    createBackgroundWindow: () => void
    checkSystemPreferences: () => void
    showNotification: () => void
}

const Main: MainInterface = {
    data: {
        snoozeTime: 10,
        openNotificationTimeStamp: 0,
        notification: null,
        mainWindow: null,
        backgroundWindow: null,
        tray: null,
    },
    init() {
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit()
            }
        })

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                Main.createForwardWindow()
            }
        })

        app.whenReady()
            .then(() => {
                Main.data.notification = new Notification({
                    title: NOTIFICATION.TITLE,
                    body: NOTIFICATION.BODY,
                })
            })
            .then(() => {
                Main.createForwardWindow()
                Main.createBackgroundWindow()
            })

        ipcMain.on('notification', () => {
            Main.showNotification()
        })

        ipcMain.on('onChangeMediaDevice', (e, options) => {
            Main.data.backgroundWindow.webContents.send('onChangeMediaDevice', options)
        })

        ipcMain.on('onChangeLocalstorage', (e) => {
            Main.data.backgroundWindow.webContents.send('onChangeLocalstorage')
        })

        ipcMain.on('onChangeResponsiveLevel', (e) => {
            Main.data.backgroundWindow.webContents.send('onChangeResponsiveLevel')
        })

        ipcMain.on('onChangeSnoozeTime', (e, localSnoozeTime) => {
            console.log(+localSnoozeTime)
            Main.data.snoozeTime = +localSnoozeTime
        })
    },
    createForwardWindow() {
        Main.data.mainWindow = new BrowserWindow({
            title: 'forward',
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: true,
            },
            show: false,
            skipTaskbar: true,
        })

        Main.data.mainWindow.webContents.openDevTools()

        Main.data.mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)

        Main.data.mainWindow.once('ready-to-show', () => {
            Main.data.mainWindow.show()
        })
    },
    createBackgroundWindow() {
        Main.data.backgroundWindow = new BrowserWindow({
            title: 'background',
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: true,
                offscreen: false,
            },
            show: false,
            skipTaskbar: true,
        })

        Main.data.backgroundWindow.webContents.openDevTools()

        Main.data.backgroundWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)

        Main.data.backgroundWindow.once('ready-to-show', () => {
            Main.data.backgroundWindow.show()
            Main.checkSystemPreferences()
        })
    },
    async checkSystemPreferences() {
        const canAccessCamera = systemPreferences.getMediaAccessStatus('camera') === 'granted'
        if (canAccessCamera) {
            await sleep(1000)
            Main.data.mainWindow.webContents.send('onChangeCameraAuthForward', true)
            Main.data.backgroundWindow.webContents.send('onChangeCameraAuthBackground', true)
        } else {
            systemPreferences.askForMediaAccess('camera').then(async (cameraAuth: boolean) => {
                await sleep(1000)
                Main.data.mainWindow.webContents.send('onChangeCameraAuthForward', cameraAuth)
                Main.data.backgroundWindow.webContents.send('onChangeCameraAuthBackground', cameraAuth)
            })
        }
    },
    showNotification() {
        const isInSnooze = new Date().getTime() - Main.data.openNotificationTimeStamp < Main.data.snoozeTime * 1000
        if (isInSnooze) {
            return
        }
        Main.data.openNotificationTimeStamp = new Date().getTime()
        Main.data.notification.show()
    },
}

Main.init()
