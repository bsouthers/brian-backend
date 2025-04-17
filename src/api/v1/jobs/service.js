// C:\Apps\Brian\src\api\v1\jobs\service.js
const { Job, Project } = require('../../../models'); // Adjust path as needed
const { Op } = require('sequelize');

/**
 * Builds the include clause for Sequelize queries based on the 'include' query parameter.
 * @param {string|string[]} includeParam - The 'include' query parameter.
 * @returns {Array} An array of include options for Sequelize.
 */
const buildJobIncludeClause = (includeParam) => {
  const includes = [];
  if (!includeParam) {
    return includes;
  }

  const relations = Array.isArray(includeParam) ? includeParam : includeParam.split(',');

  if (relations.includes('project')) { // Keep checking for 'project' in query param
    includes.push({
      model: Project,
      as: 'ProjectDetails', // Changed alias to match the Job model association
      attributes: ['id', 'name'], // Specify attributes to include for Project
    });
  }

  // Add more relations here if needed in the future

  return includes;
};

/**
 * Lists jobs based on provided query parameters.
 * @param {object} queryParams - Query parameters from the request.
 * @returns {Promise<Array<Job>>} A promise that resolves to an array of jobs.
 */
const listJobs = async (queryParams) => {
  const { include, /* other potential filters like status, projectId, etc. */ } = queryParams;

  const findOptions = {
    include: buildJobIncludeClause(include),
    // Add where clauses based on other queryParams if needed
    // where: { ... build where clause ... }
  };

  try {
    const jobs = await Job.findAll(findOptions);
    return jobs;
  } catch (error) {
    console.error('Error fetching jobs:', error);
    // Re-throw or handle error appropriately
    throw new Error('Failed to retrieve jobs.');
  }
};

module.exports = {
  listJobs,
  buildJobIncludeClause, // Exporting for potential reuse or testing
};