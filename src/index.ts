import 'dotenv/config'
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js"
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { AnchorProvider } from '@coral-xyz/anchor'
import bs58 from 'bs58'
import { PumpFunSDK } from 'pumpdotfun-sdk'
import OpenAI from 'openai'

const { RPC, DEPLOYER_KEYPAIR, OPEN_AI_KEY } = process.env
const BUY_AMOUNT = 3
const GITHUB_URL = 'https://github.com/pump-deployer/ai-pump-deployer';

const openai = new OpenAI({
    apiKey: OPEN_AI_KEY,
})

const pumpKeypairGen = () => {
    let keypair = new Keypair()
    let count = 0;

    while (keypair.publicKey.toBase58().slice(-4) !== 'pump' || count < 1_000_000) {
        keypair = new Keypair()
        count += 1
    }

    return keypair
}

const getTokenMetadataByAI = async () => {
    console.log('Sending metadata request to OpenAI...')
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 100,
        messages: [{
            role: 'system',
            content: `With the given schema, generate token metadata. I need this token to be an edgy retarded meme that fits in well with the current trends. Make some online research if you have web access. Do not make a direct copy of the existing projects like doge, pepe etc. I want you to come up with something fresh, new. Name should suggest that the token is a real money printer Make sure description is a little retarded too - do not come up with anything over the top in terms of description, up to 15 words will suffice. The token should be animal-themed. Make sure to add 'Token fully created and deployed by AI' at the end of the description. 
            
            Schema: 
            {
                name: string,
                symbol: string,
                description: string,
            }
            
            Where name can contain a maximum of 32 characters, symbol can contain a maximum of 6 characters, and description can contain a maximum of 100 characters. Symbol should be an abbreviation of name.
            Return only json object.
            `
        }],
    })

    console.log('Done')

    const mainMessage = JSON.parse(response.choices[0].message.content || '{}')

    const prompt = `Create an icon represnting things based on token data (name, symbol and description), but without attaching any text to generated image. Make it look like drawn by kid.
                Name: ${mainMessage.name}
                Symbol: ${mainMessage.symbol}
                Description: ${mainMessage.description}
        `

    console.log('Sending icon request to OpenAI...')
    const tokenIcon = await openai.images.generate({
        prompt,
        n: 1,
        size: '256x256',
        quality: 'standard',
        model: 'dall-e-2',
    })
    console.log('Done')

    const iconImageUrl = tokenIcon.data[0].url

    if (!iconImageUrl) {
        throw new Error('Icon image url not found')
    }

    console.log(`Icon image url: ${iconImageUrl}`)

    const fetchedImage = await fetch(iconImageUrl).then((res) => res.blob())

    return {
        ...mainMessage,
        file: fetchedImage,
        twitter: GITHUB_URL,
        telegram: GITHUB_URL,
        website: GITHUB_URL,
    } as {
        name: string,
        symbol: string,
        description: string,
        file: Blob
        twiiter: string,
        telegram: string,
        website: string,
    }
}

const main = async () => {
    console.log('Initializing script...')
    const connection = new Connection(RPC || "")
    const wallet = Keypair.fromSecretKey(bs58.decode(DEPLOYER_KEYPAIR || ""))
    const anchorWallet = new NodeWallet(Keypair.fromSecretKey(bs58.decode(DEPLOYER_KEYPAIR || "")))
    const provider = new AnchorProvider(connection, anchorWallet, { commitment: "finalized" })

    const sdk = new PumpFunSDK(provider)

    console.log('Generating metadata...')

    const tokenMetadata = await getTokenMetadataByAI()

    console.log(`Token metadata ready:`)
    console.dir(tokenMetadata)

    const mint = pumpKeypairGen()
    console.log(`Token mint: ${mint.publicKey}`)

    console.log('Deploying token...')
    const createResults = await sdk.createAndBuy(
        wallet,
        mint,
        tokenMetadata,
        BigInt(BUY_AMOUNT * LAMPORTS_PER_SOL),
        BigInt(100),
        {
            unitLimit: 250000,
            unitPrice: 1000000,
        }
    )

    if (createResults.success) {
        console.log('Finished')
        console.log(`https://pump.fun/${mint.publicKey.toBase58()}`)
    }
}


main()
