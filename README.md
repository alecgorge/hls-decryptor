# hls-decryptor

hls proxy that will decrypt segment files of another hls playlist

```
npm install -g hls-decryptor
```

## Usage

Start the server:

```
hls-decryptor [--port 9999] [--quiet]
```

If the playlist contains encrypted segments or encrypted subplaylists hls-decryptor will decrypt them for you.

To play an encrypted stream, use a URL like this:

```
http://192.168.1.10:9999/index.m3u8?url=http%3A%2F%2Fdevimages.apple.com%2Fiphone%2Fsamples%2Fbipbop%2Fgear1%2Fprog_index.m3u8
```

## License

MIT