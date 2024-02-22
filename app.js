import { OpenAI } from 'openai';
import fs from 'fs';
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';
import cron from 'node-cron';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();

const SHOP_URL = process.env.SHOP_URL;
const BLOG_ID = process.env.BLOG_ID; 
const ACCESS_TOKEN = process.env.ACCESS_TOKEN; 
let articlesPerDay = process.env.ARTICLES_PER_DAY;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize OpenAI with your API key
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Function to rewrite the article content using OpenAI
async function rewriteArticleContent(articleTitle) {
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: `write a blog article with detailed informations about the topic: \n${articleTitle}\n\n Make it long and more detailed and informative, in HTML format:\n1. without header and footer\n2. the first thing must be an introduction within a paragraph\n3. the second thing is the article outline, with the functionality to jump to sections\n 4. section titles must be within an h2\n5. use lists (ul - ol) to make things clear and organized\n6. highlight improtant things using bold style\n7. optimized for SEO (use relevant tags for the best SEO ranking)\n8. adjust it to be readable and coherent, and make it long with a focus on improving its search engine visibility by strategically integrating relevant keywords. Make sure the revised content maintains a conversational tone and enhances readability by simplifying complex sentences. Additionally, ensure that the information remains accurate and comprehensive while presenting it in a more engaging and coherent manner.\n
          When optimizing for SEO, include relevant keywords in the article while ensuring their natural incorporation. Improve the readability by breaking down long paragraphs, using bullet points where necessary, and ensuring a smooth flow of ideas.\n
          Maintain a balanced approach between the original article's information and improved content quality.\n\n###`,
        },
      ],
      model: 'gpt-4-1106-preview',
    });

    let rewrittenContent = completion.choices[0].message.content;
    console.log(rewrittenContent);

    rewrittenContent = rewrittenContent.replace("```html", "");

    // Remove <h1> tags from the HTML content using jsdom
    const { window } = new JSDOM(rewrittenContent);
    const { document } = window;
    const h1Elements = document.querySelectorAll('h1');
    h1Elements.forEach((h1Element) => {
      h1Element.remove();
    });

    // Get the modified HTML content after removing <h1> tags
    const htmlContent = document.documentElement.innerHTML;

    return htmlContent;
  } catch (error) {
    console.error('Error rewriting article content:', error);
    return null;
  }
}

function removeDoubleQuotes(inputString) {
    // Replace double quotes with an empty string
    return inputString.replace(/"/g, '');
}

// Function to generate the meta description using OpenAI
async function generateMetaDescription(articleTitle) {
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: `Generate a well-optimized meta description for the article about this topic: \n${articleTitle}\n\n. Include relevant keywords and make it SEO-friendly to improve search engine visibility.###`,
        },
      ],
      model: 'gpt-4-1106-preview',
    });

    let metaDescription = completion.choices[0].message.content.trim();
    metaDescription = removeDoubleQuotes(metaDescription);
    console.log(metaDescription);

    return metaDescription;
  } catch (error) {
    console.error('Error generating meta description:', error);
    return null;
  }
}

// Function to create the article on Shopify
async function createArticleOnShopify(title, htmlContent, metaDescription, imageUrl) {
  // Article data
  const articleData = {
    article: {
      blog_id: BLOG_ID,
      title: title,
      author: 'author', // Replace with the author name
      body_html: htmlContent,
      summary_html: metaDescription,
      published_at: new Date().toISOString(),
      image: {
        src: imageUrl // Include the image URL
      }
    },
  };

  // API endpoint for creating an article
  const apiVersion = '2023-10';
  const createArticleUrl = `${SHOP_URL}/admin/api/${apiVersion}/blogs/${BLOG_ID}/articles.json`;

  // Headers for the request
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': ACCESS_TOKEN,
  };

  try {
    const response = await fetch(createArticleUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(articleData),
    });

    const responseData = await response.json();
    if (response.status === 201) {
      console.log('Article created successfully on Shopify.');
      console.log('Article URL:', responseData.article.url);
    } else {
      console.log('Failed to create article on Shopify.');
      console.log('Error:', responseData);
    }
  } catch (error) {
    console.error('Error creating article on Shopify:', error.message);
  }
}

// Function to post an article
async function postArticle(articleTitle) {
  const rewrittenContent = await rewriteArticleContent(articleTitle);
  if (rewrittenContent) {
    const rewrittenTitle = articleTitle;
    if (rewrittenTitle) {
      const metaDescription = await generateMetaDescription(articleTitle);
      if (metaDescription) {
        const image = await openai.images.generate({ model: "dall-e-3", prompt: `generate a featured image for an article with title: ${rewrittenTitle}` });
        const imageUrl = image.data[0].url;
        if (image) {
          console.log('Rewritten Title:', rewrittenTitle);
          createArticleOnShopify(rewrittenTitle, rewrittenContent, metaDescription, imageUrl);
        }
      } else {
        console.log('Failed to generate meta description.');
      }
    } else {
      console.log('Failed to rewrite the title.');
    }
  } else {
    console.log('Failed to rewrite article content.');
  }
}

// Function to get a random article file from the directory
async function getAndRemoveFirstTitle(filePath) {
    try {
        // Read the content of the file
        let fileContent = await fs.promises.readFile(filePath, 'utf8');

        // Split the content by new lines
        let lines = fileContent.split('\n');

        // Check if the file is not empty
        if (lines.length === 0) {
            throw new Error('The file is empty');
        }

        // Save the first title to a variable
        let firstTitle = lines[0];

        // Remove the first title from the array
        lines.shift();

        // Join the remaining lines back into a string
        let updatedContent = lines.join('\n');

        // Write the updated content back to the file
        await fs.promises.writeFile(filePath, updatedContent, 'utf8');

        // Return the first title
        return firstTitle;
    } catch (error) {
        console.error('An error occurred:', error);
        throw error;
    }
}

// Function to perform the scheduled task
async function performScheduledTask() {
  console.log('Running the task');
  const directoryPath = './articles_topics.txt'; // Directory containing the articles
  const articleTitle = await getAndRemoveFirstTitle(directoryPath);
  console.log(articleTitle);

  if (articleTitle) {
    postArticle(articleTitle);
  } else {
    console.log('No articles left to post');
  }
}

// Calculate the interval in hours and round it
let intervalHours = Math.round(24 / articlesPerDay);
console.log(intervalHours);

// Construct the cron expression
// let cronExpression = `0 0 */${intervalHours} * * *`;

// // Schedule the task
// cron.schedule(cronExpression, () => {
//   performScheduledTask();
// });

let cronExpression = `*/5 * * * *`;

// Schedule the task
cron.schedule(cronExpression, () => {
  performScheduledTask();
});


const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Server is running');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});