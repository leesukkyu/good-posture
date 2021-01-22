import {app, BrowserWindow, Notification, systemPreferences, ipcMain, Menu, Tray} from 'electron'
import {NOTIFICATION_OPT, MODEL_TYPE} from './ini'
import path from 'path'
import express from 'express'

declare const MAIN_WINDOW_WEBPACK_ENTRY: string

let tray

if (require('electron-squirrel-startup')) {
    app.quit()
}

const isDebug = () => {
    return process.env.npm_lifecycle_event === 'start'
}

const sleep = (ms) => {
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
        forceQuit: boolean
    }
    init: () => void
    createForwardWindow: () => void
    createBackgroundWindow: () => void
    checkSystemPreferences: (cb: (cameraAuth: boolean) => void) => void
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
        forceQuit: false,
    },
    init() {
        ipcMain.on('notification', () => {
            Main.showNotification()
        })

        ipcMain.on('onChangeMediaDevice', (e, options) => {
            Main.data.backgroundWindow.webContents.send('onChangeMediaDevice', options)
        })

        ipcMain.on('onChangeLocalstorage', () => {
            Main.data.backgroundWindow.webContents.send('onChangeLocalstorage')
        })

        ipcMain.on('onChangeResponsiveLevel', () => {
            Main.data.backgroundWindow.webContents.send('onChangeResponsiveLevel')
        })

        ipcMain.on('onChangeSnoozeTime', (e, snoozeTime) => {
            Main.data.snoozeTime = +snoozeTime
        })

        ipcMain.on('onChangeStatus', (e, status) => {
            Main.data.mainWindow.webContents.send('onChangeStatus', status)
        })

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit()
            }
        })

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                Main.createForwardWindow()
            } else if (BrowserWindow.getAllWindows().length === 2) {
                Main.data.mainWindow.show()
            }
        })

        app.on('before-quit', function () {
            Main.data.forceQuit = true
        })

        app.whenReady()
            .then(() => {
                tray = new Tray('/Users/user/Desktop/git/good-posture/src/assets/icon.png')
                tray.setTitle('')
            })
            .then(() => {
                Main.data.notification = new Notification({
                    title: NOTIFICATION_OPT.TITLE,
                    body: NOTIFICATION_OPT.BODY,
                    icon: '/Users/user/Desktop/git/good-posture/src/assets/icon.png',
                })
            })
            .then(() => {
                Main.createForwardWindow()
                Main.createBackgroundWindow()
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

        if (isDebug()) {
            Main.data.mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)
            Main.data.mainWindow.webContents.openDevTools()
        } else {
            const exApp = express()
            exApp.use(express.static(path.resolve(__dirname, '..', 'renderer')))
            const server = exApp.listen(0, () => {
                Main.data.mainWindow.loadURL(`http://localhost:${server.address().port}/main_window/`)
            })
        }

        Main.data.mainWindow.once('ready-to-show', () => {
            Main.data.mainWindow.show()
            Main.checkSystemPreferences((cameraAuth) => {
                Main.data.mainWindow.webContents.send('onChangeCameraAuthForward', cameraAuth)
            })
        })

        Main.data.mainWindow.on('close', (e) => {
            if (!Main.data.forceQuit) {
                e.preventDefault()
                Main.data.mainWindow.hide()
            }
        })
    },
    createBackgroundWindow() {
        Main.data.backgroundWindow = new BrowserWindow({
            title: 'background',
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: true,
                offscreen: true,
            },
            show: false,
            skipTaskbar: true,
        })

        if (isDebug()) {
            Main.data.backgroundWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)
            Main.data.backgroundWindow.webContents.openDevTools()
        } else {
            const exApp = express()
            exApp.use(express.static(path.resolve(__dirname, '..', 'renderer')))
            const server = exApp.listen(0, () => {
                Main.data.backgroundWindow.loadURL(`http://localhost:${server.address().port}/main_window/`)
            })
        }

        Main.data.backgroundWindow.once('ready-to-show', () => {
            Main.checkSystemPreferences((cameraAuth) => {
                Main.data.backgroundWindow.webContents.send('onChangeCameraAuthBackground', cameraAuth)
            })
        })
    },
    checkSystemPreferences: (() => {
        let callCount = 0
        const cbList = []
        return async (cb) => {
            cbList.push(cb)
            callCount++
            if (callCount !== 2) {
                return
            }
            const canAccessCamera = systemPreferences.getMediaAccessStatus('camera') === 'granted'
            if (canAccessCamera) {
                await sleep(1000)
                cbList.forEach((cb) => {
                    cb(true)
                })
            } else {
                systemPreferences.askForMediaAccess('camera').then(async (cameraAuth: boolean) => {
                    await sleep(1000)
                    cbList.forEach((cb) => {
                        cb(cameraAuth)
                    })
                })
            }
        }
    })(),
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
