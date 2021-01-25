/* eslint-disable no-constant-condition */
import * as tf from '@tensorflow/tfjs'
import * as mobilenet from '@tensorflow-models/mobilenet'
import * as knnClassifier from '@tensorflow-models/knn-classifier'
import * as electron from 'electron'
import {LABEL_TYPE} from '../ini'
import CustomError from './error'
import '../styles/index.scss'

const {ipcRenderer} = electron

type dType = 'string' | 'float32' | 'int32' | 'bool' | 'complex64'

interface RendererInterface {
    data: {
        $videoElement: HTMLVideoElement
        stream: MediaStream
        stopLoop: boolean
    }
    onChangeStatus: (status: string) => void
    onRequestNotification: () => void
    setListener: () => void
    init: () => void
    initCamera: () => void
    app: {
        init: () => Promise<void>
        start: () => Promise<void>
        onChangeLocalstorage: () => void
        onChangeResponsiveLevel: () => void
    }
}

const Renderer: RendererInterface = {
    data: {
        $videoElement: <HTMLVideoElement>document.getElementById('video'),
        stream: null,
        stopLoop: false,
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
            Renderer.app.start()
        })
        ipcRenderer.on('onChangeLocalstorage', () => {
            Renderer.app.onChangeLocalstorage()
        })
        ipcRenderer.on('onChangeResponsiveLevel', () => {
            Renderer.app.onChangeResponsiveLevel()
        })
    },
    init() {
        Renderer.setListener()
        Renderer.initCamera()
        Renderer.app.init()
    },
    // 카메라 관리
    async initCamera() {
        ipcRenderer.send('onRequestMediaDeviceOpt')
    },

    // 텐서플로 관리
    app: (() => {
        let $videoElement

        let classifier: knnClassifier.KNNClassifier

        let responsiveLevel = 0

        let prevStatus: boolean

        let net = null

        const calcResponsiveLevel = (newResponsiveLevel) => {
            const data = +newResponsiveLevel
            return 1 - (data ? data / 10 : 7 / 10)
        }

        const onChangeLocalstorage = () => {
            classifier.dispose()
            classifier = knnClassifier.create()
            load()
        }

        const onChangeResponsiveLevel = () => {
            responsiveLevel = calcResponsiveLevel(localStorage.getItem('responsiveLevel'))
        }

        const load = () => {
            const t1Data = localStorage.getItem('t1Data')
            const t1Shape = localStorage.getItem('t1Shape')
            const t1DType = localStorage.getItem('t1DType')
            const t2Data = localStorage.getItem('t2Data')
            const t2Shape = localStorage.getItem('t2Shape')
            const t2DType = localStorage.getItem('t2DType')
            if (t1Data && t1Shape && t1DType && t2Data && t2Shape && t2DType) {
                try {
                    classifier.setClassifierDataset({
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
                    clearModel()
                }
            }
        }

        const clearModel = () => {
            Promise.resolve().then(() => {
                classifier.dispose()
                classifier = knnClassifier.create()
                localStorage.clear()
            })
        }

        const checkStatus = ({label, confidences}) => {
            if (label !== prevStatus) {
                prevStatus = label
                Renderer.onChangeStatus(label)
            }

            if (label === LABEL_TYPE.GOOD) {
                return false
            }
            return responsiveLevel <= confidences[label]
        }

        const start = async () => {
            while (true) {
                if (Renderer.data.stopLoop) {
                    break
                }
                if (classifier.getNumClasses() > 0) {
                    const img = tf.browser.fromPixels($videoElement)
                    const result = await classifier.predictClass(net.infer(img, true))
                    if (checkStatus(result)) {
                        Renderer.onRequestNotification()
                    }
                    img.dispose()
                }
                await tf.nextFrame()
            }
        }

        const init = async () => {
            $videoElement = Renderer.data.$videoElement
            classifier = knnClassifier.create()
            net = await mobilenet.load()
            responsiveLevel = calcResponsiveLevel(localStorage.getItem('responsiveLevel'))
            load()
            start()
        }

        return {
            init,
            start,
            onChangeLocalstorage,
            onChangeResponsiveLevel,
        }
    })(),
}

export default Renderer
