import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          <link rel="preconnect" href="https://arweave.net" crossOrigin="anonymous" />
          <link rel="preconnect" href="https://firestore.googleapis.com" crossOrigin="anonymous" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        </Head>
        <Main />
        <NextScript />
      </Html>
    );
  }
}

export default MyDocument; 