const dotenv = require('dotenv')
const speech = require('@google-cloud/speech');
const axios = require('axios');
const fs = require('fs');
const { Configuration, OpenAIApi } = require("openai");
const { Storage } = require('@google-cloud/storage');

dotenv.config();

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});

async function transcribeAudio (gcsUri) {
    // Cria uma instância do cliente da API de reconhecimento de fala
    const client = new speech.SpeechClient({
        keyFilename: './credentials/credentials.json'
    });

    // Configura a requisição de reconhecimento
    const request = {
        audio: {
            uri: gcsUri,
        },
        config: {
            encoding: 'FLAC ',
            sampleRateHertz: 20000,
            languageCode: 'pt-BR',
        },
    };

    // Envia a requisição de reconhecimento de fala para a API
    const [operation] = await client.longRunningRecognize(request);
    const [response] = await operation.promise();
    console.log({ response })
    const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
    console.log(`Transcription: ${transcription}`);
    return transcription;
}

const storage = new Storage({
    keyFilename: './credentials/credentials.json'
});

const summarize = async (text) => {
    try {
        const openai = new OpenAIApi(configuration);
        const completion = await openai.createCompletion({
            max_tokens: 500,
            model: "text-davinci-003",
            prompt: `Escreva um resumo para post no linkedin sobre o podcast: 
            ${text}.`,
            top_p: 1,
            n: 1,
            temperature: 0.7
        });
        return completion.data.choices[0].text;
    } catch (error) {
        console.log({ error })
    }
}

//Example 
(async (url = 'https://anchor.fm/s/d6c4cf8/podcast/play/44650585/https%3A%2F%2Fd3ctxlq1ktw2nl.cloudfront.net%2Fstaging%2F2021-11-10%2F1b475e33-1c61-cdf8-9e63-dfdbacb718e4.mp3') => {
    console.log(`Downloading file from ${url}`);
    const response = await axios.get(url, { responseType: 'stream' });
    console.log(`File downloaded`);
    const filePath = './audio/temp.mp3';
    response.data.pipe(fs.createWriteStream(filePath));
    console.log(`File saved locally at ${filePath}`);
    const writeStream = fs.createWriteStream(filePath);
    response.data.pipe(writeStream);
    writeStream.on('finish', async () => {
        console.log(`Uploading file to Cloud Storage`);
        const localFilePath = './audio/temp.mp3';
        const bucketName = process.env.BUCKET_NAME;
        const options = {
            metadata: {
                cacheControl: 'public, max-age=1',
            },
        };
        try {
            const file = await storage.bucket(bucketName).upload(localFilePath, options);
            console.log('UPLOADED \n ====================== \n\n');
        } catch (error) {
            console.log({ error })
        }
        console.log(`Getting public URL of the file`);
        const audioFileGs = 'gs://startse-pocs/temp.mp3';

        console.log(`Transcribing audio \n\n`);
        const transcribedAudio = await transcribeAudio(audioFileGs);
        console.log(`Generating summary \n\n ============================================== \n\n`);
        const summary = await summarize(transcribedAudio)
        console.log(summary);
    });
})();
