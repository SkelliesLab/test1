import Head from 'next/head'
import React, { useEffect, useState } from 'react';
import styles from '../styles/Home.module.css'

import { AptosClient } from "aptos";
import { useWallet } from '@manahippo/aptos-wallet-adapter';
import cmHelper from "../helpers/candyMachineHelper"
import ConnectWalletButton from '../helpers/Aptos/ConnectWalletButton';
import {candyMachineAddress, collectionName, collectionCoverUrl, MaxMint, NODE_URL, CONTRACT_ADDRESS, COLLECTION_SIZE, SERVICE_NAME} from "../helpers/candyMachineInfo"

import Spinner from "react-bootstrap/Spinner"
import Modal from "react-bootstrap/Modal"

import { toast } from 'react-toastify';

const aptosClient = new AptosClient(NODE_URL);
const autoCmRefresh = 10000;

export default function Home() {
  const wallet = useWallet();
  const [isFetchignCmData, setIsFetchignCmData] = useState(false)
  const [candyMachineData, setCandyMachineData] = useState({data: {}, fetch: fetchCandyMachineData})
  const [timeLeftToMint, setTimeLeftToMint] = useState({presale: "", public: "", timeout: null})

  const [mintInfo, setMintInfo] = useState({numToMint: 1, minting: false, success: false, mintedNfts: []})

  const [canMint, setCanMint] = useState(false)

  useEffect(() => {
    if (!wallet.autoConnect && wallet.wallet?.adapter) {
        wallet.connect();
    }
  }, [wallet.autoConnect, wallet.wallet, wallet.connect]);
  

  const [decActive, setDecActive] = useState(false);
  const [incActive, setIncActive] = useState(true);
  const [notificationActive, setNotificationActive] = useState(false);

  const incrementMintAmount = async () => {
    const mintfee = document.getElementById("mintfee")
    const mintAmount = document.getElementById("mintAmount")
    
    if (mintInfo.numToMint === 1) {
      setDecActive(current => !current);
      mintInfo.numToMint++; 
      mintfee.textContent = `${(candyMachineData.data.mintFee * mintInfo.numToMint).toFixed(2)} $APT`
      mintAmount.textContent = mintInfo.numToMint
    } 
    
    else if (mintInfo.numToMint === MaxMint-1) {
      setIncActive(current => !current);
      mintInfo.numToMint++; 
      mintfee.textContent = `${(candyMachineData.data.mintFee * mintInfo.numToMint).toFixed(2)} $APT`
      mintAmount.textContent = mintInfo.numToMint
    } 
    
    else if (mintInfo.numToMint < MaxMint) {
      mintInfo.numToMint++; 
      mintfee.textContent = `${(candyMachineData.data.mintFee * mintInfo.numToMint).toFixed(2)} $APT`
      mintAmount.textContent = mintInfo.numToMint
    }
  }

  const decrementMintAmount = async () => {
    
    const mintfee = document.getElementById("mintfee")
    const mintAmount = document.getElementById("mintAmount")
    
    if (mintInfo.numToMint === 2) {
      setDecActive(current => !current);
      mintInfo.numToMint--; 
      mintfee.textContent = `${(candyMachineData.data.mintFee * mintInfo.numToMint).toFixed(2)} $APT`
      mintAmount.textContent = mintInfo.numToMint
    } 
    
    else if (mintInfo.numToMint === MaxMint ) {
      setIncActive(current => !current);
      mintInfo.numToMint--; 
      mintfee.textContent = `${(candyMachineData.data.mintFee * mintInfo.numToMint).toFixed(2)} $APT`
      mintAmount.textContent = mintInfo.numToMint
    } 
    
    else if (mintInfo.numToMint > 1) {
      mintInfo.numToMint--; 
      mintfee.textContent = `${(candyMachineData.data.mintFee * mintInfo.numToMint).toFixed(2)} $APT`
      mintAmount.textContent = mintInfo.numToMint

    }
  }

  function timeout(delay) {
    return new Promise( res => setTimeout(res, delay) );
  }

  const mint = async () => {
    if (wallet.account?.address?.toString() === undefined) {
      setNotificationActive(current => !current);
      await timeout(3000);
      setNotificationActive(current => !current);
    }
    if (wallet.account?.address?.toString() === undefined || mintInfo.minting) return;

    console.log(wallet.account?.address?.toString());
    setMintInfo({...mintInfo, minting: true})
    // Generate a transactions
    const payload = {
      type: "entry_function_payload",
      function: `${CONTRACT_ADDRESS}::${SERVICE_NAME}::mint_tokens`,
      type_arguments: [],
      arguments: [
      	candyMachineAddress,
	      collectionName,
	      mintInfo.numToMint,
      ]
    };

    let txInfo;
    try {
      const txHash = await wallet.signAndSubmitTransaction(payload);
      console.log(txHash);
      txInfo = await aptosClient.waitForTransactionWithResult(txHash.hash)
    } catch (err) {
      txInfo = {
        success: false,
        vm_status: err.message,
      }
    }
    handleMintTxResult(txInfo)
    if (txInfo.success) setCandyMachineData({...candyMachineData, data: {...candyMachineData.data, numMintedTokens: (parseInt(candyMachineData.data.numMintedTokens) + parseInt(mintInfo.numToMint)).toString()}})
  }

  async function handleMintTxResult(txInfo) {
    console.log(txInfo);
    const mintSuccess = txInfo.success;
    console.log(mintSuccess ? "Mint success!" : `Mint failure, an error occured.`)

    let mintedNfts = []
    if (!mintSuccess) {
        /// Handled error messages
        const handledErrorMessages = new Map([
            ["Failed to sign transaction", "An error occured while signing."],
            ["Move abort in 0x1::coin: EINSUFFICIENT_BALANCE(0x10006): Not enough coins to complete transaction", "Insufficient funds to mint."],
        ]);

        const txStatusError = txInfo.vm_status;
        console.error(`Mint not successful: ${txStatusError}`);
        let errorMessage = handledErrorMessages.get(txStatusError);
        errorMessage = errorMessage === undefined ? "Unkown error occured. Try again." : errorMessage;

        toast.error(errorMessage);
    } else {
        mintedNfts = await cmHelper.getMintedNfts(aptosClient, candyMachineData.data.tokenDataHandle, candyMachineData.data.cmResourceAccount, collectionName, txInfo)
        toast.success("Minting success!")
    }

    
    setMintInfo({...mintInfo, minting: false, success: mintSuccess, mintedNfts})
}



  async function fetchCandyMachineData(indicateIsFetching = false) {
    console.log("Fetching candy machine data...")
    if (indicateIsFetching) setIsFetchignCmData(true)
    const cmResourceAccount = await cmHelper.getCandyMachineResourceAccount();
    if (cmResourceAccount === null) {
      setCandyMachineData({...candyMachineData, data: {}})
      setIsFetchignCmData(false)
      return
    }

    const collectionInfo = await cmHelper.getCandyMachineCollectionInfo(cmResourceAccount);
    const configData = await cmHelper.getCandyMachineConfigData(collectionInfo.candyMachineConfigHandle);
    setCandyMachineData({...candyMachineData, data: {cmResourceAccount, ...collectionInfo, ...configData}})
    setIsFetchignCmData(false)
  }

  function verifyTimeLeftToMint() {
    const mintTimersTimeout = setTimeout(verifyTimeLeftToMint, 1000)
    if (candyMachineData.data.presaleMintTime === undefined || candyMachineData.data.publicMintTime === undefined) return

    const currentTime = Math.round(new Date().getTime() / 1000);
    setTimeLeftToMint({timeout : mintTimersTimeout, presale: cmHelper.getTimeDifference(currentTime, candyMachineData.data.presaleMintTime), public: cmHelper.getTimeDifference(currentTime, candyMachineData.data.publicMintTime)})
  }

 useEffect(() => {
    fetchCandyMachineData();
    async function fetchCandyMachineData() {
        const cmResourceAccount = await cmHelper.getCandyMachineResourceAccount();
        const collectionInfo = await cmHelper.getCandyMachineCollectionInfo(cmResourceAccount);
        const configData = await cmHelper.getCandyMachineConfigData(collectionInfo.candyMachineConfigHandle);
        setCandyMachineData({...candyMachineData, data: {cmResourceAccount, ...collectionInfo, ...configData}})
    }
    const interval = setInterval(() => {
        fetchCandyMachineData();
    }, 5000);
    return () => clearInterval(interval);
    }, []);

  useEffect(() => {
    clearTimeout(timeLeftToMint.timeout)
    verifyTimeLeftToMint()
    console.log(candyMachineData.data)
  }, [candyMachineData])

  // useEffect(() => {
  //   setCanMint(wallet.connected && candyMachineData.data.isPublic && parseInt(candyMachineData.data.numUploadedTokens) > parseInt(candyMachineData.data.numMintedTokens) && timeLeftToMint.presale === "LIVE")
  // }, [wallet, candyMachineData, timeLeftToMint])
  useEffect(() => {
    setCanMint(true)
  }, [wallet, candyMachineData, timeLeftToMint])

  return (
    <div className="bg-gray-500">
      <div className={styles.container}>
        <Head>
          <title>Skellies Lab</title>
          <meta name="description" content="Skellies Lab" />
          <link rel="icon" href="/favicon.ico" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin />
          <link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        </Head>
        <img
          src="background.webp"
          alt={'background'}
          className={styles.bg_image}
        />

        <div
          className={styles.bg_filter}
        ></div>
        <main className={styles.main}>
          <h1 className={styles.title}>
            {collectionName}
          </h1>
          <div className={styles.topcorner}>
            <ConnectWalletButton connectButton={!wallet.connected} className="d-flex" />
          </div>

          <div id="collection-info" className="d-flex flex-column align-items-center text-white" style={{width: "80%"}}>
            {isFetchignCmData ? <Spinner animation="border" role="status" className="mt-5"><span className="visually-hidden">Loading...</span></Spinner> : 
            <>
            <div className = "my-5">              </div>
            <div><h2 className = 'text-center text-danger text-capitalize my-5'>Aptos Skellies Launchpad</h2></div>
            <p className = 'text-center text-white text-capitalize ' >The ultimate NFT launchpad exclusive only for Creator is one of the most comprehensive systems for artists to launch their NFT Collection.</p>
            <p className = 'text-center text-white text-capitalize ' >Combined with Skellies Lab innovative technology, including its NFT Management System where NFT holders can earn yield by lending their NFTs to Skellies Lab Program.</p>

            <button href="#" type="button" className="btn btn-primary" data-toggle="button" aria-pressed="true" autoComplete="off">
  Coming Soon
</button>
            <div>
              <h1 className = 'text-center text-danger text-capitalize my-5'>Features</h1>
              <div className="container text-center ">
                <div className="row">
                  <div className="col-xl-4 col-lg-4 my-5">
                    <div className="card" >
  <img src="1.png" className="card-img-top" alt="" height="300px"/>
  <div className="card-body container-sm ">
    <h5 className="card-title text-danger">Free Mint</h5>
    <p className="card-text text-black">Each NFT collection will be free mint for holders. Public mint will be paid. Because FP is temporary but Art is permanent.</p>
    <a href="#" className="btn btn-primary">More Info</a>
  </div>
</div>
                    </div>
                    <div className="col-xl-4 col-lg-4 my-5">
                      <div className="card container-sm" >
  <img src="2.png" className="card-img-top" alt="" height="300px"/>
  <div className="card-body ">
    <h5 className="card-title text-danger">Monthly Launch</h5>
    <p className="card-text text-black">NFT creators can launch thier NFTs at SkelliesLab Launchpad to reach out the web3 community globally  </p>
    <a href="#" className="btn btn-primary">More Info</a>
  </div>
</div>
                      </div>
                      <div className="col-xl-4 col-lg-4 my-5">
                        <div className="card container-sm" >
  <img src="3.png" className="card-img-top" alt="" height="300px"/>
  <div className="card-body">
    <h5 className="card-title text-danger">Holder&apos;s Benefits</h5>
    <p className="card-text text-black">Every holder of 1k Dead Scientist will be the top most priority of our next every collection.</p>
    <a href="www.google.com" className="btn btn-primary">More Info</a>
  </div>
</div>
                        </div>
                        </div>
                        </div>
              
              
            </div>

            </>}
          <div className={styles.notification} style={{opacity: notificationActive ? '1' : ''}}>
            <h6 className={styles.notificationtext}>Please connect your wallet at the top right of the page</h6>
          </div>  
          </div>

          <Modal id="mint-results-modal" show={mintInfo.success} onHide={() => setMintInfo({...mintInfo, success: false, mintedNfts: []})} centered size="lg">
            <Modal.Body className="d-flex flex-column align-items-center pt-5 pb-3">
                <div className="d-flex justify-content-center w-100 my-5" style={{flexWrap: "wrap"}}>
                    {mintInfo.mintedNfts.map(mintedNft => <div key={mintedNft.name} className={`${styles.mintedNftCard} d-flex flex-column mx-3`}>
                        <h5 className="text-white text-center mt-2">{mintedNft.name}</h5>
                    </div>)}
                </div>
            </Modal.Body>
        </Modal>
        </main>

      </div>
    </div>
  )
}
