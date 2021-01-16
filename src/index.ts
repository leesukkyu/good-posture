import {app, BrowserWindow, Notification, systemPreferences, ipcMain} from 'electron'
declare const MAIN_WINDOW_WEBPACK_ENTRY: string

if (require('electron-squirrel-startup')) {
    app.quit()
}

interface MainInterface {
    data: {
        isOpenNotification: boolean
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
        isOpenNotification: false,
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
            if (!Main.data.isOpenNotification) {
                Main.data.isOpenNotification = true
                Main.showNotification()
            }
        })

        app.whenReady().then(Main.createWindow)
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
        const options = {
            title: '자세가 바르지 않습니다.',
            body: '바른자세를 유지해주세요.',
        }
        Main.data.notification = new Notification(options)
        Main.data.notification.show()
    },
}

Main.init()
