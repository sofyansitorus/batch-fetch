#### batchFetch

The `batchFetch` function is a utility designed to batch multiple fetch requests together and handle them collectively. It allows you to send identical requests in bulk, minimizing network traffic and server load by sending only one unique request for each set of duplicated requests. This function is particularly useful when dealing with scenarios where multiple identical requests need to be made and their responses handled together.

#### Installation

You can install `batchFetch` via npm:

```bash
npm install @sofyansitorus/batch-fetch
```

#### Usage

```javascript
import batchFetch from '@sofyansitorus/batch-fetch';

batchFetch(url: string, options: RequestInit): Promise<Response>
```

- `url`: The URL to fetch.
- `options`: An object containing any custom settings that you want to apply to the request.

#### Example

```javascript
import batchFetch from '@sofyansitorus/batch-fetch';

const url = 'https://api.example.com/data';
const options = {
    method: 'POST', // Using POST method for demonstration
    body: JSON.stringify({ key: 'value' }), // Sample request data
    headers: {
        'Content-Type': 'application/json'
    }
};

const requests = Array(5).fill({ url, options });

requests.forEach(request => {
    // Sending the same request data multiple times
    batchFetch(request.url, request.options)
        .then(response => response.json()) // Parse the response body as JSON
        .then(response => {
            // Handle response
            console.log(response);
        })
        .catch(error => {
            // Handle error
            console.error(error);
        });
});
```

In this example, we're demonstrating sending the same request data to the server multiple times. The `batchFetch` utility ensures that only one unique request is sent to the server.

This optimization minimizes unnecessary network traffic and server load, improving efficiency when dealing with multiple identical requests. The responses for each batched request can then be handled as needed.

#### How it Works

`batchFetch` works by internally tracking identical requests and batching them together. When you pass the same request data to `batchFetch` multiple times, it registers these requests internally and identifies them as duplicates. Instead of sending each duplicated request separately, `batchFetch` groups identical requests together and sends only one unique request for each set of duplicates.

#### Notes

- This utility is compatible only in browser environments.

- The response from `batchFetch` is the same instance of response when using the native `fetch` function.