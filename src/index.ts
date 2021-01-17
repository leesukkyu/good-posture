import {app, BrowserWindow, Notification, systemPreferences, ipcMain} from 'electron'
declare const MAIN_WINDOW_WEBPACK_ENTRY: string

if (require('electron-squirrel-startup')) {
    app.quit()
}

interface MainInterface {
    data: {
        openNotificationTimeStamp: number
        notification: Notification
        currentWindow: BrowserWindow
    }
    init: () => void
    createWindow: () => void
    checkSystemPreferences: () => void
    showNotification: () => void
}

const Main: MainInterface = {
    data: {
        openNotificationTimeStamp: 0,
        notification: null,
        currentWindow: null,
    },
    init() {
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit()
            }
        })

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                Main.createWindow()
            }
        })

        ipcMain.on('notification', () => {
            Main.showNotification()
        })

        app.whenReady()
            .then(() => {
                Main.data.notification = new Notification({
                    title: '자세가 바르지 않습니다.',
                    body: '바른자세를 유지해주세요.',
                })
            })
            .then(Main.createWindow)
    },
    createWindow() {
        const window = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: true,
            },
            show: false,
        })

        window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)

        window.webContents.openDevTools()

        window.once('ready-to-show', () => {
            window.show()
            Main.checkSystemPreferences()
        })

        Main.data.currentWindow = window
    },
    checkSystemPreferences() {
        const canAccessCamera = systemPreferences.getMediaAccessStatus('camera') === 'granted'
        if (canAccessCamera) {
            Main.data.currentWindow.webContents.send('onChangeCameraAuth', true)
        } else {
            systemPreferences.askForMediaAccess('camera').then((cameraAuth: boolean) => {
                Main.data.currentWindow.webContents.send('onChangeCameraAuth', cameraAuth)
            })
        }
    },
    showNotification() {
        if (new Date().getTime() - Main.data.openNotificationTimeStamp < 10000) {
            return
        }
        Main.data.openNotificationTimeStamp = new Date().getTime()
        Main.data.notification.show()
    },
}

Main.init()
