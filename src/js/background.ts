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
        $webcamElement: HTMLVideoElement
        stream: MediaStream
    }
    init: () => void
    initCamera: () => void
    app: () => void
}

const Renderer: RendererInterface = {
    data: {
        $webcamElement: <HTMLVideoElement>document.getElementById('webcam'),
        stream: null,
    },
    init() {
        Renderer.initCamera()
        Renderer.app()
    },

    // 카메라 관리
    async initCamera() {
        const getWebcamStream = async (options) => {
            const stream = await navigator.mediaDevices.getUserMedia(options)
            Renderer.data.$webcamElement.srcObject = stream
            Renderer.data.stream = stream
        }
        try {
            ipcRenderer.on('onChangeMediaDevice', (e, payload) => {
                getWebcamStream(payload)
            })
        } catch (err) {
            CustomError.dispatch(err)
        }
    },

    // 텐서플로 관리
    async app() {
        let classifier: knnClassifier.KNNClassifier = knnClassifier.create()

        let responsiveLevel = 0

        const net = await mobilenet.load()

        const getImageFromWebcam = () => {
            return tf.browser.fromPixels(Renderer.data.$webcamElement)
        }

        ipcRenderer.on('onChangeLocalstorage', (e) => {
            classifier.dispose()
            classifier = knnClassifier.create()
            load()
        })

        ipcRenderer.on('onChangeResponsiveLevel', (e) => {
            responsiveLevel = +localStorage.getItem('responsiveLevel')
            console.log(responsiveLevel)
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

        const resultCheck = (result) => {
            const isBad = result.label === MODEL_TYPE.BAD
            if (!isBad) {
                return false
            }
            return responsiveLevel / 10 < result.confidences[result.label]
        }

        const setResponsiveLevel = () => {
            const newResponsiveLevel = +localStorage.getItem('responsiveLevel')
            responsiveLevel = newResponsiveLevel ? newResponsiveLevel : 7
        }

        setResponsiveLevel()
        load()

        while (true) {
            if (classifier.getNumClasses() > 0) {
                const img = getImageFromWebcam()

                const activation = net.infer(img, true)
                const result = await classifier.predictClass(activation)
                if (resultCheck(result)) {
                    ipcRenderer.send('notification')
                }
                img.dispose()
            }
            await tf.nextFrame()
        }
    },
}

export default Renderer
