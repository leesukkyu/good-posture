/* eslint-disable no-constant-condition */
import * as tf from '@tensorflow/tfjs'
import * as mobilenet from '@tensorflow-models/mobilenet'
import * as knnClassifier from '@tensorflow-models/knn-classifier'
import * as electron from 'electron'
import {LABEL_TYPE} from '../ini'
import '../styles/index.scss'

const {ipcRenderer} = electron

type dType = 'string' | 'float32' | 'int32' | 'bool' | 'complex64'

interface RendererInterface {
    data: {
        $videoElement: HTMLVideoElement
        stream: MediaStream
        stopLoop: boolean
        app: App
    }
    onChangeStatus: (status: string) => void
    onRequestNotification: () => void
    setListener: () => void
    init: () => void
    initCamera: () => void
}

const Renderer: RendererInterface = {
    data: {
        $videoElement: <HTMLVideoElement>document.getElementById('video'),
        stream: null,
        stopLoop: false,
        app: null,
    },
    onChangeStatus(status) {
        ipcRenderer.send('onChangeStatus', status)
    },
    onRequestNotification() {
        ipcRenderer.send('notification')
    },
    setListener() {
        ipcRenderer.on('onChangeMediaDevice', async (e, mediaDeviceOpt) => {
            const stream = await navigator.mediaDevices.getUserMedia(mediaDeviceOpt)
            Renderer.data.$videoElement.srcObject = stream
            Renderer.data.stream = stream
        })
        ipcRenderer.on('onRequestStop', () => {
            Renderer.data.stopLoop = true
        })
        ipcRenderer.on('onRequestRestart', () => {
            Renderer.data.stopLoop = false
            Renderer.data.app.start()
        })
        ipcRenderer.on('onChangeLocalstorage', () => {
            Renderer.data.app.onChangeLocalstorage()
        })
        ipcRenderer.on('onChangeCheckTime', () => {
            Renderer.data.app.onChangeCheckTime()
        })
        ipcRenderer.on('onChangeResponsiveLevel', () => {
            Renderer.data.app.onChangeResponsiveLevel()
        })
    },
    init() {
        Renderer.setListener()
        Renderer.initCamera()
        Renderer.data.app = new App()
    },
    // 카메라 관리
    async initCamera() {
        ipcRenderer.send('onRequestMediaDeviceOpt')
    },
}

class App {
    // 텐서플로 관리
    $videoElement: HTMLVideoElement

    classifier: knnClassifier.KNNClassifier

    responsiveLevel: number

    checkTime: number

    prevStatus: boolean

    net: mobilenet.MobileNet

    interval: NodeJS.Timeout

    isLooping: boolean

    constructor() {
        this.init()
    }

    public async init() {
        this.isLooping = false
        this.$videoElement = Renderer.data.$videoElement
        this.classifier = knnClassifier.create()
        this.net = await mobilenet.load()
        this.responsiveLevel = this.calcResponsiveLevel(localStorage.getItem('responsiveLevel'))
        this.checkTime = this.calcCheckTime(localStorage.getItem('checkTime'))
        this.load()
        this.start()
    }

    calcCheckTime = (newCheckTime) => {
        const data = +newCheckTime
        return data ? data : 10
    }

    calcResponsiveLevel = (newResponsiveLevel) => {
        const data = +newResponsiveLevel
        return 1 - (data ? data / 10 : 7 / 10)
    }

    load() {
        const t1Data = localStorage.getItem('t1Data')
        const t1Shape = localStorage.getItem('t1Shape')
        const t1DType = localStorage.getItem('t1DType')
        const t2Data = localStorage.getItem('t2Data')
        const t2Shape = localStorage.getItem('t2Shape')
        const t2DType = localStorage.getItem('t2DType')
        if (t1Data && t1Shape && t1DType && t2Data && t2Shape && t2DType) {
            try {
                this.classifier.setClassifierDataset({
                    [LABEL_TYPE.GOOD]: tf.tensor(
                        t1Data.split(',').map((item) => +item),
                        [+t1Shape.split(',')[0], +t1Shape.split(',')[1]],
                        t1DType as dType,
                    ),
                    [LABEL_TYPE.BAD]: tf.tensor(
                        t2Data.split(',').map((item) => +item),
                        [+t2Shape.split(',')[0], +t2Shape.split(',')[1]],
                        t2DType as dType,
                    ),
                })
            } catch (error) {
                this.clearModel()
            }
        }
    }

    clearModel() {
        Promise.resolve().then(() => {
            this.classifier.dispose()
            this.classifier = knnClassifier.create()
            localStorage.clear()
        })
    }

    checkStatus({label, confidences}) {
        if (label !== this.prevStatus) {
            this.prevStatus = label
            Renderer.onChangeStatus(label)
        }

        if (label === LABEL_TYPE.GOOD) {
            return false
        }
        return this.responsiveLevel <= confidences[label]
    }

    public onChangeLocalstorage() {
        this.classifier.dispose()
        this.classifier = knnClassifier.create()
        this.load()
    }

    public onChangeCheckTime() {
        this.checkTime = this.calcCheckTime(localStorage.getItem('checkTime'))
        clearInterval(this.interval)
        this.isLooping = false
        this.start()
    }

    public onChangeResponsiveLevel() {
        this.responsiveLevel = this.calcResponsiveLevel(localStorage.getItem('responsiveLevel'))
    }

    public async start() {
        this.interval = setInterval(async () => {
            if (this.isLooping) {
                return
            }
            if (Renderer.data.stopLoop) {
                clearInterval(this.interval)
            }
            this.isLooping = true
            if (this.classifier.getNumClasses() > 0) {
                const img = tf.browser.fromPixels(this.$videoElement)
                const result = await this.classifier.predictClass(this.net.infer(img, true))
                if (this.checkStatus(result)) {
                    Renderer.onRequestNotification()
                }
                img.dispose()
            }
            this.isLooping = false
        }, this.checkTime * 1000)
    }
}

export default Renderer
