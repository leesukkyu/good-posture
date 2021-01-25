/* eslint-disable no-constant-condition */
import * as tf from '@tensorflow/tfjs'
import * as mobilenet from '@tensorflow-models/mobilenet'
import * as knnClassifier from '@tensorflow-models/knn-classifier'
import * as electron from 'electron'
import {MODEL_TYPE} from '../ini'
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
    init: () => void
    initCamera: () => void
    app: {
        init: () => Promise<void>
        start: () => Promise<void>
    }
}

const Renderer: RendererInterface = {
    data: {
        $videoElement: <HTMLVideoElement>document.getElementById('video'),
        stream: null,
        stopLoop: false,
    },
    init() {
        Renderer.initCamera()
        Renderer.app.init()
    },

    // 카메라 관리
    async initCamera() {
        const getWebcamStream = async (options) => {
            const stream = await navigator.mediaDevices.getUserMedia(options)
            Renderer.data.$videoElement.srcObject = stream
            Renderer.data.stream = stream
        }
        try {
            ipcRenderer.on('onChangeMediaDevice', (e, mediaDeviceOpt) => {
                getWebcamStream(mediaDeviceOpt)
            })
            ipcRenderer.on('onRequestStop', (e, mediaDeviceOpt) => {
                Renderer.data.stopLoop = true
            })
            ipcRenderer.on('onRequestRestart', (e, mediaDeviceOpt) => {
                Renderer.data.stopLoop = false
                Renderer.app.start()
            })
            ipcRenderer.send('onRequestMediaDeviceOpt')
        } catch (err) {
            CustomError.dispatch(err)
        }
    },

    // 텐서플로 관리
    app: (() => {
        let classifier: knnClassifier.KNNClassifier = knnClassifier.create()

        let responsiveLevel = 0

        let currentStatus: boolean

        let net = null

        ipcRenderer.on('onChangeLocalstorage', () => {
            classifier.dispose()
            classifier = knnClassifier.create()
            load()
        })

        ipcRenderer.on('onChangeResponsiveLevel', () => {
            responsiveLevel = calcResponsiveLevel(localStorage.getItem('responsiveLevel'))
        })

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
                        [MODEL_TYPE.GOOD]: tf.tensor(
                            t1Data.split(',').map((item) => +item),
                            [+t1Shape.split(',')[0], +t1Shape.split(',')[1]],
                            t1DType as dType,
                        ),
                        [MODEL_TYPE.BAD]: tf.tensor(
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

        const checkStatus = (result) => {
            const isBad = result.label === MODEL_TYPE.BAD
            if (currentStatus !== isBad) {
                currentStatus = isBad
                ipcRenderer.send('onChangeStatus', currentStatus ? MODEL_TYPE.BAD : MODEL_TYPE.GOOD)
            }
            if (!isBad) {
                return false
            }
            return responsiveLevel <= result.confidences[result.label]
        }

        const setResponsiveLevel = () => {
            const newResponsiveLevel = localStorage.getItem('responsiveLevel')
            responsiveLevel = calcResponsiveLevel(newResponsiveLevel)
        }

        const calcResponsiveLevel = (newResponsiveLevel) => {
            let data = +newResponsiveLevel
            data = data ? data / 10 : 7 / 10
            data = 1 - data
            return data
        }

        const start = async () => {
            while (true) {
                if (Renderer.data.stopLoop) {
                    break
                }
                if (classifier.getNumClasses() > 0) {
                    const img = tf.browser.fromPixels(Renderer.data.$videoElement)
                    const activation = net.infer(img, true)
                    const result = await classifier.predictClass(activation)
                    if (checkStatus(result)) {
                        ipcRenderer.send('notification')
                    }
                    img.dispose()
                }
                await tf.nextFrame()
            }
        }

        const init = async () => {
            net = await mobilenet.load()
            setResponsiveLevel()
            load()
            start()
        }

        return {
            init,
            start,
        }
    })(),
}

export default Renderer
