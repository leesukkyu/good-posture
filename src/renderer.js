const tf = require('@tensorflow/tfjs')
const mobilenet = require('@tensorflow-models/mobilenet')
const knnClassifier = require('@tensorflow-models/knn-classifier')
const ipc = require('electron').ipcRenderer

const Renderer = {
    data: {
        $webcamElement: document.getElementById('webcam'),
        stream: null,
    },
    init() {
        window.addEventListener('err', function (e) {
            console.log(e.detail)
        })
        ipc.on('onChangeCameraAuth', (e, cameraAuth) => {
            if (cameraAuth) {
                Renderer.initCamera()
                Renderer.app()
            }
        })
    },

    // 카메라 관리
    async initCamera() {
        const $videoSelect = document.getElementById('videoDeviceSelect')

        const getWebcamStream = async () => {
            if (Renderer.data.stream) {
                Renderer.data.stream.getTracks().forEach((track) => {
                    track.stop()
                })
            }
            const videoSource = $videoSelect.value
            const options = {
                video: {deviceId: videoSource ? {exact: videoSource} : undefined},
            }
            const stream = await navigator.mediaDevices.getUserMedia(options)
            Renderer.data.$webcamElement.srcObject = stream
            Renderer.data.stream = stream
        }

        const createWebcamSelectOption = async () => {
            let index = 0
            const deviceList = await navigator.mediaDevices.enumerateDevices()
            deviceList.forEach((device) => {
                if (device.kind === 'videoinput') {
                    const $option = document.createElement('option')
                    $option.value = device.deviceId
                    $option.text = device.label || `카메라 ${++index}`
                    $videoSelect.appendChild($option)
                }
            })
        }

        try {
            $videoSelect.addEventListener('change', getWebcamStream)
            await createWebcamSelectOption()
            await getWebcamStream()
        } catch (err) {
            window.dispatchEvent(new CustomEvent('err', {detail: err}))
        }
    },

    // 텐서플로 관리
    async app() {
        const classifier = knnClassifier.create()

        const getImageFromWebcam = () => {
            return tf.browser.fromPixels(Renderer.data.$webcamElement)
        }

        const net = await mobilenet.load()

        const addExample = async (classId) => {
            const img = getImageFromWebcam()
            const activation = net.infer(img, true)
            classifier.addExample(activation, classId)
            img.dispose()
        }

        document.getElementById('class-a').addEventListener('click', () => addExample(0))
        document.getElementById('class-b').addEventListener('click', () => addExample(1))

        while (true) {
            if (classifier.getNumClasses() > 0) {
                const img = getImageFromWebcam()

                // Get the activation from mobilenet from the webcam.
                const activation = net.infer(img, 'conv_preds')
                // Get the most likely class and confidence from the classifier module.
                const result = await classifier.predictClass(activation)

                const classes = ['A', 'B']
                document.getElementById('console').innerText = `
              prediction: ${classes[result.label]}\n
              probability: ${result.confidences[result.label]}
            `

                // Dispose the tensor to release the memory.
                img.dispose()
            }

            await tf.nextFrame()
        }
    },
}

Renderer.init()
