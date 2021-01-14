const {app, BrowserWindow, systemPreferences, remote} = require('electron')

const Main = {
    data: {
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

        window.loadFile('src/index.html')
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
            systemPreferences.askForMediaAccess('camera').then((cameraAuth) => {
                Main.data.currentWindow.webContents.send('onChangeCameraAuth', true)
            })
        }
    },
}

Main.init()
