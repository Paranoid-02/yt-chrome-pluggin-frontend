document.addEventListener('DOMContentLoaded', function() {
  const testButton = document.getElementById('testButton');
  const sentimentDiv = document.getElementById('sentiment');

  testButton.addEventListener('click', function() {
    sentimentDiv.textContent = 'Fetching sentiment...'; // Provide feedback

    // Replace with your actual API endpoint
    const apiUrl = 'https://localhost:5000/predict';
    const commentToTest = "This is a great video!";

    fetch(apiUrl, {
      method: 'POST', // Or 'GET', depending on your API
      headers: {
        'Content-Type': 'application/json',
        // Add any other necessary headers, like authorization tokens
      },
      body: JSON.stringify({ comment: commentToTest }) // Send the comment in the request body
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json(); // Parse the JSON response
    })
    .then(data => {
      // Assuming the API returns data in the format { sentiment: 'positive' }
      sentimentDiv.textContent = `Sentiment: ${data.sentiment}`;
    })
    .catch(error => {
      console.error('Error fetching sentiment:', error);
      sentimentDiv.textContent = 'Error fetching sentiment.';
    });
  });
});