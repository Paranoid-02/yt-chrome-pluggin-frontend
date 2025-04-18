document.addEventListener("DOMContentLoaded", async () => {
  const outputDiv = document.getElementById("output");
  const API_KEY = "AIzaSyCw3-iFWXinbxPFSUPcWhYckRRG1rGGwik";
  const API_URL = "http://localhost:5000";

  // Get the current tab's URL
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const url = tabs[0].url;
    const youtubeRegex =
      /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/;
    const match = url.match(youtubeRegex);

    if (match && match[1]) {
      const videoId = match[1];
      outputDiv.innerHTML = `<div class="section-title">YouTube Video ID</div><p>${videoId}</p><p>Fetching comments...</p>`;

      const comments = await fetchComments(videoId);
      if (comments.length === 0) {
        outputDiv.innerHTML += "<p>No comments found for this video.</p>";
        return;
      }

      outputDiv.innerHTML += `<p>Fetched ${comments.length} comments. Performing sentiment analysis...</p>`;
      const predictions = await getSentimentPredictions(comments);

      if (predictions) {
        // Process the predictions to get sentiment counts and sentiment data
        const sentimentCounts = { 1: 0, 0: 0, "-1": 0 };
        const sentimentData = []; // For trend graph
        let totalSentimentScore = 0; // Initialize score
        let validPredictionCount = 0; // Count only valid predictions for averages

        predictions.forEach((item, index) => {
          // Validate sentiment before processing
          const sentimentStr = String(item.sentiment).trim(); // Ensure it's a string and trim whitespace
          const sentimentInt = parseInt(sentimentStr, 10); // Parse as integer

          // Check if sentiment is a valid number (-1, 0, or 1)
          if (
            !isNaN(sentimentInt) &&
            (sentimentInt === -1 || sentimentInt === 0 || sentimentInt === 1)
          ) {
            // Increment count for valid sentiment
            sentimentCounts[sentimentStr]++; // Use the original string key for counts

            // Add to sentimentData for trend graph
            sentimentData.push({
              timestamp: item.timestamp, // Ensure timestamp is valid
              sentiment: sentimentInt, // Use the parsed integer
            });

            // Add to total score and count for averages
            totalSentimentScore += sentimentInt;
            validPredictionCount++;
          } else {
            // Log invalid sentiment received from backend for debugging
            console.warn(
              `Invalid or non-numeric sentiment received: '${
                item.sentiment
              }' for comment: "${item.comment.substring(0, 50)}..."`
            );
          }
        });

        // Compute metrics using only valid predictions
        const totalComments = comments.length; // Total fetched comments
        const uniqueCommenters = new Set(
          comments.map((comment) => comment.authorId)
        ).size;
        const totalWords = comments.reduce(
          (sum, comment) =>
            sum +
            comment.text.split(/\s+/).filter((word) => word.length > 0).length,
          0
        );
        // Calculate averages based on valid predictions if available
        const avgWordLength =
          totalComments > 0 ? (totalWords / totalComments).toFixed(2) : "N/A";
        const avgSentimentScore =
          validPredictionCount > 0
            ? (totalSentimentScore / validPredictionCount).toFixed(2)
            : "N/A";

        // Normalize the average sentiment score only if it's a valid number
        const normalizedSentimentScore =
          avgSentimentScore !== "N/A"
            ? (((parseFloat(avgSentimentScore) + 1) / 2) * 10).toFixed(2)
            : "N/A";

        // Add the Comment Analysis Summary section
        outputDiv.innerHTML += `
          <div class="section">
            <div class="section-title">Comment Analysis Summary</div>
            <div class="metrics-container">
              <div class="metric">
                <div class="metric-title">Total Comments</div>
                <div class="metric-value">${totalComments}</div>
              </div>
              <div class="metric">
                <div class="metric-title">Unique Commenters</div>
                <div class="metric-value">${uniqueCommenters}</div>
              </div>
              <div class="metric">
                <div class="metric-title">Avg Comment Length</div>
                <div class="metric-value">${avgWordLength} words</div>
              </div>
              <div class="metric">
                <div class="metric-title">Avg Sentiment Score</div>
                <div class="metric-value">${normalizedSentimentScore}/10</div>
              </div>
            </div>
          </div>
        `;

        // Add the Sentiment Analysis Results section with a placeholder for the chart
        outputDiv.innerHTML += `
          <div class="section">
            <div class="section-title">Sentiment Analysis Results</div>
            <p>See the pie chart below for sentiment distribution.</p>
            <div id="chart-container"></div>
          </div>`;

        // Fetch and display the pie chart inside the chart-container div
        await fetchAndDisplayChart(sentimentCounts);

        // Add the Sentiment Trend Graph section
        outputDiv.innerHTML += `
          <div class="section">
            <div class="section-title">Sentiment Trend Over Time</div>
            <div id="trend-graph-container"></div>
          </div>`;

        // Fetch and display the sentiment trend graph (only if there's valid data)
        if (sentimentData.length > 0) {
          await fetchAndDisplayTrendGraph(sentimentData);
        } else {
          const trendGraphContainer = document.getElementById(
            "trend-graph-container"
          );
          if (trendGraphContainer) {
            trendGraphContainer.innerHTML =
              "<p>No valid sentiment data for trend graph.</p>";
          }
        }

        // Add the Word Cloud section
        outputDiv.innerHTML += `
          <div class="section">
            <div class="section-title">Comment Wordcloud</div>
            <div id="wordcloud-container"></div>
          </div>`;

        // Fetch and display the word cloud inside the wordcloud-container div
        await fetchAndDisplayWordCloud(comments.map((comment) => comment.text));

        // Add the top comments section
        outputDiv.innerHTML += `
          <div class="section">
            <div class="section-title">Top 25 Comments with Sentiments</div>
            <ul class="comment-list">
              ${predictions
                .slice(0, 25)
                .map(
                  (item, index) => `
                <li class="comment-item">
                  <span>${index + 1}. ${item.comment}</span><br>
                  <span class="comment-sentiment">Sentiment: ${
                    item.sentiment
                  }</span>
                </li>`
                )
                .join("")}
            </ul>
          </div>`;
      }
    } else {
      outputDiv.innerHTML = "<p>This is not a valid YouTube URL.</p>";
    }
  });

  async function fetchComments(videoId) {
    let comments = [];
    let pageToken = "";
    try {
      while (comments.length < 500) {
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&pageToken=${pageToken}&key=${API_KEY}`
        );
        const data = await response.json();
        if (data.items) {
          data.items.forEach((item) => {
            const commentText =
              item.snippet.topLevelComment.snippet.textOriginal;
            const timestamp = item.snippet.topLevelComment.snippet.publishedAt;
            const authorId =
              item.snippet.topLevelComment.snippet.authorChannelId?.value ||
              "Unknown";
            comments.push({
              text: commentText,
              timestamp: timestamp,
              authorId: authorId,
            });
          });
        }
        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
      outputDiv.innerHTML += "<p>Error fetching comments.</p>";
    }
    return comments;
  }

  async function getSentimentPredictions(comments) {
    try {
      // Ensure comments being sent have text and timestamp
      const validComments = comments.filter((c) => c && c.text && c.timestamp);
      if (validComments.length !== comments.length) {
        console.warn(
          "Some comments were missing text or timestamp and were filtered before sending to backend."
        );
      }
      if (validComments.length === 0) {
        console.error(
          "No valid comments with text and timestamp to send for prediction."
        );
        return null; // Or return empty array?
      }

      const response = await fetch(`${API_URL}/predict_with_timestamps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send only valid comments
        body: JSON.stringify({ comments: validComments }),
      });
      const result = await response.json();
      if (response.ok) {
        return result;
      } else {
        throw new Error(result.error || "Error fetching predictions");
      }
    } catch (error) {
      console.error("Error fetching predictions:", error);
      outputDiv.innerHTML += "<p>Error fetching sentiment predictions.</p>";
      return null;
    }
  }

  async function fetchAndDisplayChart(sentimentCounts) {
    try {
      const response = await fetch(`${API_URL}/generate_chart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentiment_counts: sentimentCounts }),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch chart image");
      }
      const blob = await response.blob();
      const imgURL = URL.createObjectURL(blob);
      const img = document.createElement("img");
      img.src = imgURL;
      img.style.width = "100%";
      img.style.marginTop = "20px";
      // Append the image to the chart-container div
      const chartContainer = document.getElementById("chart-container");
      chartContainer.appendChild(img);
    } catch (error) {
      console.error("Error fetching chart image:", error);
      outputDiv.innerHTML += "<p>Error fetching chart image.</p>";
    }
  }

  async function fetchAndDisplayWordCloud(comments) {
    try {
      const response = await fetch(`${API_URL}/generate_wordcloud`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments }),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch word cloud image");
      }
      const blob = await response.blob();
      const imgURL = URL.createObjectURL(blob);
      const img = document.createElement("img");
      img.src = imgURL;
      img.style.width = "100%";
      img.style.marginTop = "20px";
      // Append the image to the wordcloud-container div
      const wordcloudContainer = document.getElementById("wordcloud-container");
      wordcloudContainer.appendChild(img);
    } catch (error) {
      console.error("Error fetching word cloud image:", error);
      outputDiv.innerHTML += "<p>Error fetching word cloud image.</p>";
    }
  }

  async function fetchAndDisplayTrendGraph(sentimentData) {
    // Log the data being sent
    console.log("Data being sent to /generate_trend_graph:", sentimentData);

    // Check if sentimentData is valid
    if (!Array.isArray(sentimentData) || sentimentData.length === 0) {
      console.error("Invalid or empty sentimentData for trend graph.");
      const trendGraphContainer = document.getElementById(
        "trend-graph-container"
      );
      if (trendGraphContainer) {
        trendGraphContainer.innerHTML =
          "<p>Not enough data to generate trend graph.</p>";
      }
      return; // Stop if data is invalid
    }
    // Check if timestamps are present (log first few)
    console.log(
      "Sample timestamps:",
      sentimentData.slice(0, 5).map((d) => d.timestamp)
    );
    // Check if sentiments are valid numbers (new check)
    const invalidSentiments = sentimentData.filter(
      (d) => typeof d.sentiment !== "number" || isNaN(d.sentiment)
    );
    if (invalidSentiments.length > 0) {
      console.error(
        "Invalid non-numeric sentiments found in data being sent:",
        invalidSentiments
      );
      const trendGraphContainer = document.getElementById(
        "trend-graph-container"
      );
      if (trendGraphContainer) {
        trendGraphContainer.innerHTML =
          "<p>Error: Invalid sentiment data detected before sending.</p>";
      }
      return; // Stop if data is invalid
    }

    try {
      const response = await fetch(`${API_URL}/generate_trend_graph`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentiment_data: sentimentData }),
      });

      // Log the response status
      console.log(
        "Response status from /generate_trend_graph:",
        response.status,
        response.statusText
      );

      if (!response.ok) {
        // Try to get error text from backend if possible
        let errorText = `Failed to fetch trend graph image. Status: ${response.status}`;
        try {
          const errorJson = await response.json();
          errorText += ` - ${errorJson.error || "Unknown backend error"}`;
        } catch (e) {
          // Ignore if response is not JSON
        }
        throw new Error(errorText);
      }

      const blob = await response.blob();
      const imgURL = URL.createObjectURL(blob);
      const img = document.createElement("img");
      img.src = imgURL;
      img.style.width = "100%";
      img.style.marginTop = "20px";
      img.alt = "Sentiment Trend Graph"; // Add alt text

      // Append the image to the trend-graph-container div
      const trendGraphContainer = document.getElementById(
        "trend-graph-container"
      );
      // Check if the container exists before appending
      if (trendGraphContainer) {
        trendGraphContainer.innerHTML = ""; // Clear previous content/errors
        trendGraphContainer.appendChild(img);
      } else {
        console.error("Element with ID 'trend-graph-container' not found.");
        // Optionally update the main outputDiv as a fallback
        outputDiv.innerHTML += "<p>Error: Trend graph container not found.</p>";
      }
    } catch (error) {
      console.error("Error fetching trend graph image:", error);
      const trendGraphContainer = document.getElementById(
        "trend-graph-container"
      );
      if (trendGraphContainer) {
        trendGraphContainer.innerHTML = `<p>Error fetching trend graph: ${error.message}</p>`;
      } else {
        outputDiv.innerHTML += `<p>Error fetching trend graph: ${error.message}</p>`;
      }
    }
  }
});
