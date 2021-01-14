const tf = require('@tensorflow/tfjs')
const mobilenet = require('@tensorflow-models/mobilenet')
const knnClassifier = require('@tensorflow-models/knn-classifier')
let net

const webcamElement = document.getElementById('webcam')

const classifier = knnClassifier.create()

const getImageFromWebcam = () => {
    return tf.browser.fromPixels(webcamElement)
}

async function app() {
    console.log('Loading mobilenet..')

    // Load the model.
    net = await mobilenet.load()
    console.log('Successfully loaded model')

    const addExample = async (classId) => {
        // Capture an image from the web camera.
        const img = getImageFromWebcam()

        // Get the intermediate activation of MobileNet 'conv_preds' and pass that
        // to the KNN classifier.
        const activation = net.infer(img, true)

        // Pass the intermediate activation to the classifier.
        classifier.addExample(activation, classId)

        // Dispose the tensor to release the memory.
        img.dispose()
    }

    // When clicking a button, add an example for that class.
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
}

const Renderer = {
    init() {
        require('electron').ipcRenderer.on('onChangeCameraAuth', function (event, cameraAuth) {
            if (cameraAuth) {
                console.log('gogo')
                Renderer.initCamera()
                app()
            }
        })
    },
    initCamera() {
        // video 초기화
        navigator.getUserMedia(
            {video: true, audio: false},
            (stream) => {
                webcamElement.srcObject = stream
            },
            (error) => {
                console.log(`Error${error}`)
            },
        )
    },
}

Renderer.init()
