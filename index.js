require('dotenv').config();
const express=require("express")
const app=express()
const cors = require('cors');

const axios = require('axios')
const {open}=require("sqlite")
const sqlite3=require("sqlite3")
const path=require("path")

const dbPath=process.env.DB_PATH
console.log(dbPath)

app.use(express.json())

app.use(cors());

let db;
const initializeDbAndServer=async()=>{
    try{
        db=await open({
            filename:dbPath,
            driver:sqlite3.Database
        })

        const PORT = process.env.PORT || 3000; // 
        app.listen(PORT, () => {
        console.log(`Server is running at port ${PORT}`);
    });
    }
    catch(e){
        console.log(`Db error: ${e.message}`)
        process.exit(1)
    }
}

initializeDbAndServer();


//Fetch data from given api for seeding.
const fetchAndInsert = async () => {
      const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
      const data = response.data;
      
      for(let item of data){
        const existingData = await db.get(`SELECT id FROM transactions WHERE id = ${item.id}`);
            if (!existingData) {
        await db.run(
            'INSERT INTO transactions (id, title, price, description, category, image, sold, dateOfSale) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                item.id,
                item.title,
                item.price,
                item.description,
                item.category,
                item.image,
                item.sold,
                item.dateOfSale
            ]
        );
            }
        
      }
}

fetchAndInsert()

//ALL Transactions api with search 
app.get("/transactions/", async(request,response)=>{
    const {search_q="", page=1,month=""}=request.query
    const offset=(page-1)*10
    let monthFilter=""
    if(month){
        monthFilter=`AND
        strftime("%m", dateOfSale) = '${month}'`
    }

    const getAllTransactions=`
    SELECT * from transactions
    WHERE (title LIKE '%${search_q}%' OR 
    description LIKE '%${search_q}%' OR
    category LIKE '%${search_q}' OR
    price LIKE '%${search_q}%') 
    ${monthFilter}
    LIMIT 10 
    OFFSET ${offset};
    `

    const dbResponse= await db.all(getAllTransactions)
    response.send(dbResponse)
})

//stats of a month
app.get("/statistics/" , async(request,response)=>{
    
    const {month=""}=request.query

    let monthFilter=""
    if(month){
        monthFilter=`AND
        strftime("%m", dateOfSale) = '${month}'`
    }
    

    const salesQuery=`
    SELECT SUM(price) as total_sale,
    COUNT(sold) AS total_sold
    FROM transactions
    WHERE sold= TRUE
    ${monthFilter};
    `

    const unsoldQuery = `
    SELECT COUNT(*) AS total_unsold
    FROM transactions
    WHERE sold = FALSE 
    ${monthFilter};
`;

    const totalSales=await db.get(salesQuery)
    const unsold=await db.get(unsoldQuery)

    response.send({totalSales,unsold})
})

//For bar chart price-range
app.get("/barchart/", async(request,response)=>{

    const {month=""}=request.query

    let monthFilter=""
    if(month){
        monthFilter=`WHERE strftime("%m", dateOfSale) = '${month}'`
    }

    const rangeQuery=`
    SELECT 
    CASE 
        WHEN price BETWEEN 0 AND 100 THEN '0-100'
        WHEN price BETWEEN 101 AND 200 THEN '101-200'
        WHEN price BETWEEN 201 AND 300 THEN '201-300'
        WHEN price BETWEEN 301 AND 400 THEN '301-400'
        WHEN price BETWEEN 401 AND 500 THEN '401-500'
        WHEN price BETWEEN 501 AND 600 THEN '501-600'
        WHEN price BETWEEN 601 AND 700 THEN '601-700'
        WHEN price BETWEEN 701 AND 800 THEN '701-800'
        WHEN price BETWEEN 801 AND 900 THEN '801-900'
        ELSE '901-above'
    END AS price_range,
    COUNT(*) AS count
    FROM transactions
    ${monthFilter}
    GROUP BY price_range;
    `

    const dbResponse=await db.all(rangeQuery)
    response.send(dbResponse)
})

//pie chart api for unique items
app.get("/unique-items/", async(request,response)=>{
    const {month=""}=request.query

    let monthFilter=""
    if(month){
        monthFilter=`WHERE strftime("%m",dateOfSale)='${month}'`
    }

    const uniqueQuery=`
    SELECT category,
    COUNT(*) as count
    FROM transactions
    ${monthFilter}
    GROUP BY category;
    `
    const dbResponse=await db.all(uniqueQuery)
    response.send(dbResponse)

})

//combined Api
app.get("/combined-data/", async (request, response) => {
    const { search_q, page, month } = request.query;

    try {
        // Fetch data from API 1 with additional query parameters
        const response1 = await axios.get(`http://localhost:3000/transactions/?search_q=${search_q}&page=${page}&month=${month}`);
        const data1 = response1.data;

        // Fetch data from API 2 with additional query parameters
        const response2 = await axios.get(`http://localhost:3000/statistics/?month=${month}`);
        const data2 = response2.data;

        // Fetch data from API 3 with additional query parameters
        const response3 = await axios.get(`http://localhost:3000/barchart/?month=${month}`);
        const data3 = response3.data;

        const response4=await axios.get(`http://localhost:3000/unique-items/?month=${month}`);
        const data4=response4.data;

        // Combine data from all APIs into a single JSON object
        const combinedData = {
            transactionsData: data1,
            statisticsData: data2,
            barchartData: data3,
            uniqueCategories:data4
        };

        response.json(combinedData);
    } catch (error) {
        response.status(500).json({ error: "Failed to fetch combined data" });
    }
});


