import * as electron from 'electron'
import Forward from './js/forward'
import Background from './js/background'

const {ipcRenderer} = electron
interface RendererInterface {
    init: () => void
}

const Renderer: RendererInterface = {
    init() {
        ipcRenderer.on('onChangeCameraAuthForward', (e: electron.IpcRendererEvent, cameraAuth: boolean) => {
            if (cameraAuth) {
                Forward.init()
            }
        })
        ipcRenderer.on('onChangeCameraAuthBackground', (e: electron.IpcRendererEvent, cameraAuth: boolean) => {
            if (cameraAuth) {
                Background.init()
            }
        })
    },
}

Renderer.init()
