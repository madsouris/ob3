# Improving UI and UX

This needs to be done before we packaging. They are some small functionality missing or some styles are wrong.

1. Business logo is missing

In the settings, we have all the business information but not logo. We should allow the user to have a logo for their business and the log should shows up on invoices and estimates, including prints.
The logo should be saved in an image folder with their private user data.

2. Sheet content has no left and right paddings.
3. We need mardown render on any place we are displaying markdown, writing experience is also needed however apart from a complicated platejs, I couldn't find a good solution.
4. Have preview view separate from the form

For example on contact profile, click on one from the table, it opens the edit form currently. We should have another view to display the nicely designed contact page with edit button.

5. Date time picker should be shadcn components instead of browser native
6. Attaching documents

In invoice or estimate creation, terms document should be more opened. I imagine having tags like selection, so we can put in 1 or more documents, once save they all get rendered on the view and prints.

7. CSV import in the settings
We might need to offer the skeleton CSV so the user can download, fill it in with their data, and import the correct data to us.

8. Dark mode key toggle, could be shit D or anything that's not interfere with default browser behavior

9. dashboard metric such as:
  - Total revenue
  - This month revenu
  - More logs in the settings -> workspace, more of system log, how much cpu ram or space we're using

10. I think documents should be divided into 2:
  - Global docs, like our terms etc
  - Client scoped docs, could be specialized proposal, contracts etc, and we should offer variables auto fill 
  - documents should be able to print out like invoice
