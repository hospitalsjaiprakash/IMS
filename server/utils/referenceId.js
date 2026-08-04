// utils/referenceId.js
const generateReferenceId = async (client) => {
  const year = new Date().getFullYear();
  
  // Get next sequence number for this year
  const result = await client.query(
    `SELECT COALESCE(MAX(seq_number), 0) + 1 as next_seq 
     FROM incidents WHERE year = $1`,
    [year]
  );
  
  const seqNumber = result.rows[0].next_seq;
  const padded = String(seqNumber).padStart(5, '0');
  const referenceId = `JPHRC/IMS/${year}/${padded}`;
  
  return { referenceId, year, seqNumber };
};

module.exports = { generateReferenceId };
