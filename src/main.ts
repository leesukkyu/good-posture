import {app, BrowserWindow, Notification, systemPreferences, ipcMain, Menu, Tray} from 'electron'
import path from 'path'
import express from 'express'
import {Server} from 'http'
import {NOTIFICATION_OPT, WINDOW, SERVER_PORT} from './ini'

declare const MAIN_WINDOW_WEBPACK_ENTRY: string

if (require('electron-squirrel-startup')) {
    app.quit()
}

const isDebug = (() => {
    return process.env.npm_lifecycle_event === 'start'
})()

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
        contextMenu: Menu
        forceQuit: boolean
        mediaDeviceOpt: unknown
        server: Server
        sound: boolean
        beforeRequestMediaDeviceFromBackground: boolean
        isFirstStart: boolean
    }
    init: () => void
    setListener: () => void
    createTray: () => void
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
        contextMenu: null,
        forceQuit: false,
        mediaDeviceOpt: null,
        server: null,
        sound: false,
        beforeRequestMediaDeviceFromBackground: true,
        isFirstStart: true,
    },
    init() {
        Main.setListener()
        app.whenReady().then(Main.createTray).then(Main.createForwardWindow)
    },
    setListener() {
        ipcMain.on('notification', () => {
            if (Main.data.backgroundWindow.isDestroyed()) {
                return
            }
            Main.showNotification()
        })

        ipcMain.on('onChangeMediaDevice', (e, mediaDeviceOpt) => {
            Main.data.mediaDeviceOpt = mediaDeviceOpt
            if (Main.data.beforeRequestMediaDeviceFromBackground) {
                return
            }
            if (Main.data.backgroundWindow.isDestroyed()) {
                return
            }
            Main.data.backgroundWindow.webContents.send('onChangeMediaDevice', mediaDeviceOpt)
        })

        ipcMain.on('onRequestMediaDeviceOpt', () => {
            if (Main.data.backgroundWindow.isDestroyed()) {
                return
            }
            Main.data.beforeRequestMediaDeviceFromBackground = false
            Main.data.backgroundWindow.webContents.send('onChangeMediaDevice', Main.data.mediaDeviceOpt)
        })

        ipcMain.on('onChangeLocalstorage', () => {
            if (Main.data.backgroundWindow.isDestroyed()) {
                return
            }
            Main.data.backgroundWindow.webContents.send('onChangeLocalstorage')
        })

        ipcMain.on('onChangeCheckTime', () => {
            if (Main.data.backgroundWindow.isDestroyed()) {
                return
            }
            Main.data.backgroundWindow.webContents.send('onChangeCheckTime')
        })

        ipcMain.on('onChangeResponsiveLevel', () => {
            if (Main.data.backgroundWindow.isDestroyed()) {
                return
            }
            Main.data.backgroundWindow.webContents.send('onChangeResponsiveLevel')
        })

        ipcMain.on('onChangeSnoozeTime', (e, snoozeTime) => {
            if (Main.data.backgroundWindow.isDestroyed()) {
                return
            }
            Main.data.snoozeTime = +snoozeTime
        })

        ipcMain.on('onChangeStatus', (e, status) => {
            if (Main.data.mainWindow.isDestroyed()) {
                return
            }
            Main.data.mainWindow.webContents.send('onChangeStatus', status)
        })

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit()
            }
        })

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                if (Main.data.contextMenu) {
                    Main.data.contextMenu.items[0].checked = true
                }
                Main.createForwardWindow()
            } else if (BrowserWindow.getAllWindows().length === 2) {
                Main.data.mainWindow.show()
            }
        })

        app.on('before-quit', function () {
            Main.data.forceQuit = true
        })
    },
    createTray() {
        Main.data.tray = new Tray(path.resolve(__dirname, 'assets/icon_tray.png'))
        Main.data.contextMenu = Menu.buildFromTemplate([
            {
                label: '감지',
                type: 'checkbox',
                checked: true,
                click: (menuItem) => {
                    if (menuItem.checked) {
                        Main.createForwardWindow()
                    } else {
                        Main.data.mainWindow.destroy()
                        Main.data.backgroundWindow.destroy()
                    }
                },
            },
            {
                label: '소리',
                checked: false,
                type: 'checkbox',
                click: (menuItem) => {
                    Main.data.sound = menuItem.checked
                },
            },
            {
                label: '설정',
                click: () => {
                    if (Main.data.backgroundWindow.isDestroyed()) {
                        Main.data.contextMenu.items[0].checked = true
                        Main.createForwardWindow()
                        return
                    } else {
                        Main.data.mainWindow.show()
                    }
                },
            },
            {
                label: '종료',
                click: () => {
                    app.quit()
                },
            },
        ])
        Main.data.tray.setTitle('')
        Main.data.tray.setToolTip('기린이')
        Main.data.tray.setContextMenu(Main.data.contextMenu)
    },
    createForwardWindow() {
        Main.data.mainWindow = new BrowserWindow({
            title: '오지랖프',
            width: WINDOW.WIDTH,
            height: WINDOW.HEIGHT,
            webPreferences: {
                nodeIntegration: true,
            },
            show: false,
            skipTaskbar: false,
            resizable: isDebug,
        })

        if (isDebug) {
            Main.data.mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)
            Main.data.mainWindow.webContents.openDevTools()
        } else {
            if (Main.data.isFirstStart) {
                const expressApp = express()
                expressApp.use(express.static(path.resolve(__dirname, '..', 'renderer')))
                Main.data.server = expressApp.listen(SERVER_PORT, () => {
                    Main.data.isFirstStart = false
                    Main.data.mainWindow.loadURL(`http://localhost:${SERVER_PORT}/main_window/`)
                })
            } else {
                Main.data.mainWindow.loadURL(`http://localhost:${SERVER_PORT}/main_window/`)
            }
        }

        Main.data.mainWindow.once('ready-to-show', () => {
            Main.data.mainWindow.show()
            Main.checkSystemPreferences((cameraAuth) => {
                Main.data.mainWindow.webContents.send('onChangeCameraAuthForward', cameraAuth)
                Main.createBackgroundWindow()
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
                offscreen: !isDebug,
            },
            show: false,
        })

        if (isDebug) {
            Main.data.backgroundWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY)
            Main.data.backgroundWindow.webContents.openDevTools()
        } else {
            Main.data.backgroundWindow.loadURL(`http://localhost:${SERVER_PORT}/main_window/`)
        }

        Main.data.backgroundWindow.once('ready-to-show', async () => {
            isDebug && Main.data.backgroundWindow.show()
            await sleep(1000)
            Main.data.backgroundWindow.webContents.send('onChangeCameraAuthBackground', true)
        })
    },
    async checkSystemPreferences(cb) {
        const canAccessCamera = systemPreferences.getMediaAccessStatus('camera') === 'granted'
        if (canAccessCamera) {
            await sleep(1000)
            cb(true)
        } else {
            systemPreferences.askForMediaAccess('camera').then(async (cameraAuth: boolean) => {
                await sleep(1000)
                cb(cameraAuth)
            })
        }
    },
    showNotification() {
        if (!Main.data.notification) {
            Main.data.notification = new Notification({
                title: NOTIFICATION_OPT.TITLE,
                body: NOTIFICATION_OPT.BODY,
                icon: path.resolve(__dirname, 'assets/notification.png'),
            })
        }
        const isInSnooze = new Date().getTime() - Main.data.openNotificationTimeStamp < Main.data.snoozeTime * 1000
        if (isInSnooze) {
            return
        }
        Main.data.openNotificationTimeStamp = new Date().getTime()
        Main.data.notification.show()
        Main.data.sound && Main.data.mainWindow.webContents.send('onPlayAlarmSound')
    },
}

Main.init()
